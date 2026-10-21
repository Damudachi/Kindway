-- Kindway Phase 5C: real AI follow-up conversations about one entry.
--
-- A third, separate consent scope. The entry_reflection disclosure covers "a reflection on a
-- specific entry" only; it never described sending follow-up messages or earlier turns, so it
-- is not stretched to cover them. `follow_up` is granted and withdrawn on its own.
--
-- Stored: one row per completed exchange: the user's follow-up message and the validated
-- reply, with minimal audit metadata. It is what later turns use as context, so the server reads
-- earlier turns from the account instead of trusting the app's copy. Never stored: the system
-- prompt, the provider request, the entry text (it stays in `entries`) or raw model output.
--
-- Deletion rule:
-- - Deleting the entry deletes its follow-up conversation (cascade).
-- - "Clear this conversation" deletes that entry's rows (delete policy below).
-- - "Delete AI outputs" (delete_ai_outputs) now also deletes every follow-up conversation,
--   both sides: the messages were written to be sent to AI and only exist as AI conversations.
-- - Withdrawing consent stops new requests; existing conversations stay until deleted.
-- - Deleting the account deletes everything (cascade from auth.users).

-- A third consent scope ---------------------------------------------------------------------

alter table public.ai_consents drop constraint ai_consents_scope_check;
alter table public.ai_consents add constraint ai_consents_scope_check
  check (scope in ('entry_reflection', 'cross_entry_analysis', 'follow_up'));

-- A third kind of request in the ledger, with its own limits --------------------------------

alter table public.ai_requests drop constraint ai_requests_kind_check;
alter table public.ai_requests add constraint ai_requests_kind_check
  check (kind in ('reflection', 'insights', 'follow_up'));

-- Same function as in 20261020170000_ai_outputs.sql; only the accepted kinds change.
create or replace function public.ai_begin_request(p_kind text, p_key uuid, p_cooldown_seconds integer, p_daily_limit integer)
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
  if p_kind is null or p_kind not in ('reflection', 'insights', 'follow_up') or p_key is null
     or p_cooldown_seconds is null or p_cooldown_seconds not between 0 and 86400
     or p_daily_limit is null or p_daily_limit not between 1 and 1000 then
    raise exception 'Invalid request limits' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai_requests:' || uid::text, 0));

  select * into existing from public.ai_requests r
   where r.user_id = uid and r.kind = p_kind and r.idempotency_key = p_key;
  if found then
    return jsonb_build_object('outcome', 'duplicate', 'request_id', existing.id, 'status', existing.status);
  end if;

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

-- Follow-up exchanges ------------------------------------------------------------------------

create table public.ai_follow_ups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_id text not null,
  request_id uuid not null unique,
  style text not null check (style in ('listen', 'understand', 'honest', 'forward', 'ask')),
  -- What the user wrote. Bounded like the function's own limit.
  message text not null check (char_length(message) between 1 and 2000),
  output jsonb not null check (jsonb_typeof(output) = 'object' and pg_column_size(output) <= 8000),
  schema_version text not null check (char_length(schema_version) between 1 and 40),
  prompt_version text not null check (char_length(prompt_version) between 1 and 40),
  provider text not null check (char_length(provider) between 1 and 40),
  model text not null check (char_length(model) between 1 and 120),
  created_at timestamptz not null default now(),
  -- Both keys include user_id: a conversation can only belong to the caller's own entry and
  -- the caller's own request.
  foreign key (user_id, entry_id) references public.entries (user_id, id) on delete cascade,
  foreign key (user_id, request_id) references public.ai_requests (user_id, id) on delete cascade
);

create index ai_follow_ups_entry_idx on public.ai_follow_ups (user_id, entry_id, created_at);

alter table public.ai_follow_ups enable row level security;

create policy "Own AI follow-ups: read" on public.ai_follow_ups for select to authenticated
  using ((select auth.uid()) = user_id);
-- Saved only against the caller's own follow-up request still in progress; never edited.
create policy "Own AI follow-ups: create" on public.ai_follow_ups for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.ai_requests r
                 where r.id = request_id and r.user_id = (select auth.uid())
                   and r.kind = 'follow_up' and r.status = 'pending')
  );
create policy "Own AI follow-ups: delete" on public.ai_follow_ups for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.ai_follow_ups from anon, authenticated, public;
grant select, insert, delete on public.ai_follow_ups to authenticated;

-- "Delete AI outputs" also deletes follow-up conversations. Runs as the caller.
create or replace function public.delete_ai_outputs()
returns void
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  delete from public.ai_follow_ups where user_id = auth.uid();
  delete from public.ai_reflections where user_id = auth.uid();
  delete from public.ai_insights where user_id = auth.uid();
end;
$$;
