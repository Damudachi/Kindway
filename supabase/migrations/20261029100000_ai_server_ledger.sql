-- Phase 7, AI provenance, step 1 of 3: server-only ledger functions.
--
-- The Edge Functions will open and close requests with the server key, passing the user id from
-- the verified token, and write AI rows themselves (step 2). Step 3 then removes signed-in
-- callers' rights to do either directly, so "Written by AI" can only come from the server.
--
-- This step only adds. The old functions become wrappers around the new ones with auth.uid(),
-- and keep their grants, so the functions already deployed keep working until step 2 replaces
-- them. Behaviour, results and error codes are unchanged.

create function public.ai_server_begin_request(p_user uuid, p_kind text, p_key uuid, p_cooldown_seconds integer, p_daily_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.ai_requests;
  latest timestamptz;
  oldest timestamptz;
  used integer;
  new_id uuid;
begin
  if p_user is null then
    raise exception 'Missing user' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('reflection', 'insights', 'follow_up') or p_key is null
     or p_cooldown_seconds is null or p_cooldown_seconds not between 0 and 86400
     or p_daily_limit is null or p_daily_limit not between 1 and 1000 then
    raise exception 'Invalid request limits' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai_requests:' || p_user::text, 0));

  select * into existing from public.ai_requests r
   where r.user_id = p_user and r.kind = p_kind and r.idempotency_key = p_key;
  if found then
    return jsonb_build_object('outcome', 'duplicate', 'request_id', existing.id, 'status', existing.status);
  end if;

  update public.ai_requests r
     set status = 'failed', error_code = 'abandoned', finished_at = now()
   where r.user_id = p_user and r.status = 'pending' and r.created_at < now() - interval '2 minutes';

  if exists (select 1 from public.ai_requests r where r.user_id = p_user and r.status = 'pending') then
    return jsonb_build_object('outcome', 'busy');
  end if;

  select max(r.created_at) into latest from public.ai_requests r where r.user_id = p_user and r.kind = p_kind;
  if latest is not null and latest > now() - make_interval(secs => p_cooldown_seconds) then
    return jsonb_build_object('outcome', 'rate', 'retry_after',
      ceil(extract(epoch from latest + make_interval(secs => p_cooldown_seconds) - now()))::integer);
  end if;

  select count(*), min(r.created_at) into used, oldest from public.ai_requests r
   where r.user_id = p_user and r.kind = p_kind and r.created_at > now() - interval '24 hours';
  if used >= p_daily_limit then
    return jsonb_build_object('outcome', 'rate', 'retry_after',
      greatest(1, ceil(extract(epoch from oldest + interval '24 hours' - now())))::integer);
  end if;

  insert into public.ai_requests (user_id, kind, idempotency_key) values (p_user, p_kind, p_key)
  returning id into new_id;
  return jsonb_build_object('outcome', 'started', 'request_id', new_id);
end;
$$;

-- Closes a pending request of that user. Only pending -> succeeded/failed; another user's request is left alone.
create function public.ai_server_finish_request(p_user uuid, p_request_id uuid, p_status text, p_error_code text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null then
    raise exception 'Missing user' using errcode = '22023';
  end if;
  if p_status not in ('succeeded', 'failed') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;
  update public.ai_requests r
     set status = p_status, error_code = left(p_error_code, 40), finished_at = now()
   where r.id = p_request_id and r.user_id = p_user and r.status = 'pending';
end;
$$;

revoke all on function public.ai_server_begin_request(uuid, text, uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.ai_server_finish_request(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.ai_server_begin_request(uuid, text, uuid, integer, integer) to service_role;
grant execute on function public.ai_server_finish_request(uuid, uuid, text, text) to service_role;

-- The old functions, as wrappers for the caller (removed in step 3). Same signatures and grants.
create or replace function public.ai_begin_request(p_kind text, p_key uuid, p_cooldown_seconds integer, p_daily_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  return public.ai_server_begin_request(auth.uid(), p_kind, p_key, p_cooldown_seconds, p_daily_limit);
end;
$$;

create or replace function public.ai_finish_request(p_request_id uuid, p_status text, p_error_code text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform public.ai_server_finish_request(auth.uid(), p_request_id, p_status, p_error_code);
end;
$$;
