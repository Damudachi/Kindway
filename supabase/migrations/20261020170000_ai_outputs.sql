-- Kindway Phase 4B/4C: what real AI produced, and the request ledger that limits it.
--
-- Stored: the structured output the app shows, and minimal audit metadata (provider, model,
-- prompt and schema versions, when, which request). Never stored: the provider request, the
-- system prompt, the submitted entry text, or raw model output.
--
-- Deletion rule:
-- - Deleting an entry deletes the AI reflections about it and every AI review that used it.
-- - "Delete AI outputs" (delete_ai_outputs) deletes all of the caller's reflections and reviews.
-- - Deleting the account deletes everything here, including the request ledger.
-- - The request ledger itself holds no content and is kept so limits can't be reset by deleting it.

-- Request ledger: rate limits, one request at a time, and duplicate-submit protection ---------

create table public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('reflection', 'insights')),
  -- Chosen by the app per user action; a repeated key is the same request, not a new one.
  idempotency_key uuid not null,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  -- A coarse code such as 'rate' or 'timeout'. Never content.
  error_code text check (char_length(error_code) <= 40),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (user_id, kind, idempotency_key),
  unique (user_id, id)
);

create index ai_requests_user_created_idx on public.ai_requests (user_id, kind, created_at desc);

-- Starts a request for the signed-in caller, or says why not. Runs as its owner so callers
-- can't edit the ledger directly, but only ever touches the caller's own rows (auth.uid()).
-- The limits come from the Edge Function's configuration. Someone calling this directly with
-- other limits only adds rows to their own ledger, which makes their own limits stricter.
create function public.ai_begin_request(p_kind text, p_key uuid, p_cooldown_seconds integer, p_daily_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  existing public.ai_requests;
  latest timestamptz;
  oldest timestamptz;
  used integer;
  new_id uuid;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('reflection', 'insights') or p_key is null
     or p_cooldown_seconds is null or p_cooldown_seconds not between 0 and 86400
     or p_daily_limit is null or p_daily_limit not between 1 and 1000 then
    raise exception 'Invalid request limits' using errcode = '22023';
  end if;

  -- One caller's requests are decided one at a time, so rapid taps can't all slip through.
  perform pg_advisory_xact_lock(hashtextextended('ai_requests:' || uid::text, 0));

  select * into existing from public.ai_requests r
   where r.user_id = uid and r.kind = p_kind and r.idempotency_key = p_key;
  if found then
    return jsonb_build_object('outcome', 'duplicate', 'request_id', existing.id, 'status', existing.status);
  end if;

  -- A request that never finished (the function crashed or was stopped) stops blocking after
  -- two minutes; the provider timeout is far shorter.
  update public.ai_requests r
     set status = 'failed', error_code = 'abandoned', finished_at = now()
   where r.user_id = uid and r.status = 'pending' and r.created_at < now() - interval '2 minutes';

  if exists (select 1 from public.ai_requests r where r.user_id = uid and r.status = 'pending') then
    return jsonb_build_object('outcome', 'busy');
  end if;

  select max(r.created_at) into latest from public.ai_requests r where r.user_id = uid and r.kind = p_kind;
  if latest is not null and latest > now() - make_interval(secs => p_cooldown_seconds) then
    return jsonb_build_object('outcome', 'rate', 'retry_after',
      ceil(extract(epoch from latest + make_interval(secs => p_cooldown_seconds) - now()))::integer);
  end if;

  select count(*), min(r.created_at) into used, oldest from public.ai_requests r
   where r.user_id = uid and r.kind = p_kind and r.created_at > now() - interval '24 hours';
  if used >= p_daily_limit then
    return jsonb_build_object('outcome', 'rate', 'retry_after',
      greatest(1, ceil(extract(epoch from oldest + interval '24 hours' - now())))::integer);
  end if;

  insert into public.ai_requests (user_id, kind, idempotency_key) values (uid, p_kind, p_key)
  returning id into new_id;
  return jsonb_build_object('outcome', 'started', 'request_id', new_id);
end;
$$;

-- Closes the caller's own pending request. Only pending -> succeeded/failed.
create function public.ai_finish_request(p_request_id uuid, p_status text, p_error_code text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_status not in ('succeeded', 'failed') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;
  update public.ai_requests r
     set status = p_status, error_code = left(p_error_code, 40), finished_at = now()
   where r.id = p_request_id and r.user_id = auth.uid() and r.status = 'pending';
end;
$$;

-- AI reflections on one entry --------------------------------------------------------------

create table public.ai_reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_id text not null,
  request_id uuid not null unique,
  style text not null check (style in ('listen', 'understand', 'honest', 'forward', 'ask')),
  output jsonb not null check (jsonb_typeof(output) = 'object' and pg_column_size(output) <= 16000),
  schema_version text not null check (char_length(schema_version) between 1 and 40),
  prompt_version text not null check (char_length(prompt_version) between 1 and 40),
  provider text not null check (char_length(provider) between 1 and 40),
  model text not null check (char_length(model) between 1 and 120),
  -- The version of the entry the reflection was written for.
  entry_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (user_id, entry_id) references public.entries (user_id, id) on delete cascade,
  foreign key (user_id, request_id) references public.ai_requests (user_id, id) on delete cascade
);

create index ai_reflections_entry_idx on public.ai_reflections (user_id, entry_id, created_at desc);

-- AI reviews across entries ----------------------------------------------------------------

create table public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  request_id uuid not null unique,
  period text not null check (period in ('week', 'month')),
  range_start timestamptz not null,
  range_end timestamptz not null,
  entry_count integer not null check (entry_count between 1 and 100),
  output jsonb not null check (jsonb_typeof(output) = 'object' and pg_column_size(output) <= 32000),
  schema_version text not null check (char_length(schema_version) between 1 and 40),
  prompt_version text not null check (char_length(prompt_version) between 1 and 40),
  provider text not null check (char_length(provider) between 1 and 40),
  model text not null check (char_length(model) between 1 and 120),
  created_at timestamptz not null default now(),
  check (range_end > range_start),
  unique (user_id, id),
  foreign key (user_id, request_id) references public.ai_requests (user_id, id) on delete cascade
);

create index ai_insights_user_created_idx on public.ai_insights (user_id, created_at desc);

-- Every entry that was sent for a review. Both keys include user_id, so a review can only
-- point at entries of the same account.
create table public.ai_insight_sources (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  insight_id uuid not null,
  entry_id text not null,
  primary key (user_id, insight_id, entry_id),
  foreign key (user_id, insight_id) references public.ai_insights (user_id, id) on delete cascade,
  foreign key (user_id, entry_id) references public.entries (user_id, id) on delete cascade
);

create index ai_insight_sources_entry_idx on public.ai_insight_sources (user_id, entry_id);

-- Deleting an entry also deletes any AI review that was written from it, so no AI text derived
-- from a deleted entry survives. Runs as owner so it also works during account deletion; it
-- only touches the deleted entry's own account.
create function public.delete_ai_insights_for_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.ai_insights i
   where i.user_id = old.user_id
     and i.id in (select s.insight_id from public.ai_insight_sources s where s.user_id = old.user_id and s.entry_id = old.id);
  return old;
end;
$$;

create trigger entries_delete_ai_insights before delete on public.entries
  for each row execute function public.delete_ai_insights_for_entry();

-- "Delete AI outputs": every AI reflection and review of the caller. Runs as the caller.
create function public.delete_ai_outputs()
returns void
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  delete from public.ai_reflections where user_id = auth.uid();
  delete from public.ai_insights where user_id = auth.uid();
end;
$$;

-- Row Level Security -----------------------------------------------------------------------

alter table public.ai_requests enable row level security;
alter table public.ai_reflections enable row level security;
alter table public.ai_insights enable row level security;
alter table public.ai_insight_sources enable row level security;

-- The ledger is read-only to its owner; it changes only through the two functions above.
create policy "Own AI requests: read" on public.ai_requests for select to authenticated
  using ((select auth.uid()) = user_id);

-- Outputs can be saved only against the caller's own request that is still in progress, and
-- never edited afterwards.
create policy "Own AI reflections: read" on public.ai_reflections for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Own AI reflections: create" on public.ai_reflections for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.ai_requests r
                 where r.id = request_id and r.user_id = (select auth.uid())
                   and r.kind = 'reflection' and r.status = 'pending')
  );
create policy "Own AI reflections: delete" on public.ai_reflections for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Own AI insights: read" on public.ai_insights for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Own AI insights: create" on public.ai_insights for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.ai_requests r
                 where r.id = request_id and r.user_id = (select auth.uid())
                   and r.kind = 'insights' and r.status = 'pending')
  );
create policy "Own AI insights: delete" on public.ai_insights for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Own AI insight sources: read" on public.ai_insight_sources for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Own AI insight sources: create" on public.ai_insight_sources for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Own AI insight sources: delete" on public.ai_insight_sources for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Least privilege ----------------------------------------------------------------------------

revoke all on public.ai_requests, public.ai_reflections, public.ai_insights, public.ai_insight_sources from anon, authenticated, public;
grant select on public.ai_requests to authenticated;
grant select, insert, delete on public.ai_reflections, public.ai_insights, public.ai_insight_sources to authenticated;

revoke all on function public.ai_begin_request(text, uuid, integer, integer) from anon, public;
revoke all on function public.ai_finish_request(uuid, text, text) from anon, public;
revoke all on function public.delete_ai_outputs() from anon, public;
revoke all on function public.delete_ai_insights_for_entry() from anon, public, authenticated;
grant execute on function public.ai_begin_request(text, uuid, integer, integer) to authenticated;
grant execute on function public.ai_finish_request(uuid, text, text) to authenticated;
grant execute on function public.delete_ai_outputs() to authenticated;
