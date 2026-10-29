-- The AI request ledger. Since Phase 7 only the server (service_role, used by the Edge Functions
-- with the user id from the verified token) can open and close requests. These tests check the
-- grants, that hostile arguments are rejected, and that one user's calls never touch another's.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-4000-a000-0000000000a2', 'ledger-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-0000000000b2', 'ledger-b@example.test', 'authenticated', 'authenticated');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.as_server() returns void language sql as $$
  select set_config('role', 'service_role', true), set_config('request.jwt.claims', '{"role":"service_role"}', true);
$$;
create function pg_temp.begin_req(uid uuid, kind text, key uuid, cooldown integer default 0, daily integer default 50) returns text language sql as $$
  select public.ai_server_begin_request(uid, kind, key, cooldown, daily) ->> 'outcome';
$$;
create function pg_temp.status_of(id uuid) returns text language sql security definer as $$
  select status from public.ai_requests where ai_requests.id = status_of.id;
$$;

-- Definitions and grants --------------------------------------------------------------------
select is((select count(*)::int from pg_proc where pronamespace = 'public'::regnamespace and proname in ('ai_begin_request', 'ai_finish_request')), 0,
          'The caller-run ledger functions are gone');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
             and not coalesce(p.proconfig @> array['search_path=""'], false)), 0,
          'Every security-definer function in public pins an empty search_path');
select ok(not has_function_privilege('authenticated', 'public.ai_server_begin_request(uuid, text, uuid, integer, integer)', 'execute'), 'Signed-in callers cannot open requests');
select ok(not has_function_privilege('authenticated', 'public.ai_server_finish_request(uuid, uuid, text, text)', 'execute'), 'Signed-in callers cannot close requests');
select ok(not has_function_privilege('anon', 'public.ai_server_finish_request(uuid, uuid, text, text)', 'execute'), 'anon cannot close requests');
select is((select count(*)::int from pg_proc p, aclexplode(p.proacl) a
            where p.oid in ('public.ai_server_begin_request'::regproc, 'public.ai_server_finish_request'::regproc) and a.grantee = 0), 0,
          'Neither function is granted to PUBLIC');

-- Hostile arguments -------------------------------------------------------------------------
select pg_temp.as_server();
select throws_ok($$ select public.ai_server_begin_request('00000000-0000-4000-a000-0000000000a2', null, gen_random_uuid(), 0, 50) $$, '22023', null, 'A null kind is rejected');
select throws_ok($$ select public.ai_server_begin_request('00000000-0000-4000-a000-0000000000a2', 'other', gen_random_uuid(), 0, 50) $$, '22023', null, 'Unknown request kinds are rejected');
select throws_ok($$ select public.ai_server_begin_request('00000000-0000-4000-a000-0000000000a2', 'reflection', null, 0, 50) $$, '22023', null, 'A null key is rejected');
select throws_ok($$ select public.ai_server_begin_request('00000000-0000-4000-a000-0000000000a2', 'reflection', gen_random_uuid(), null, 50) $$, '22023', null, 'A null cooldown is rejected');
select throws_ok($$ select public.ai_server_begin_request('00000000-0000-4000-a000-0000000000a2', 'reflection', gen_random_uuid(), 86401, 50) $$, '22023', null, 'An out-of-range cooldown is rejected');
select throws_ok($$ select public.ai_server_begin_request('00000000-0000-4000-a000-0000000000a2', 'reflection', gen_random_uuid(), 0, 0) $$, '22023', null, 'A zero daily limit is rejected');
select throws_ok($$ select public.ai_server_begin_request('00000000-0000-4000-a000-0000000000a2', 'reflection', gen_random_uuid(), 0, 1001) $$, '22023', null, 'An out-of-range daily limit is rejected');
select is((select count(*)::int from public.ai_requests), 0, 'Rejected calls record nothing');

-- Finishing: only pending -> succeeded/failed, never back, never another status -------------
select is(pg_temp.begin_req('00000000-0000-4000-a000-0000000000a2', 'reflection', '30000000-0000-4000-8000-000000000001'), 'started', 'A request starts for A');
select throws_ok($$ select public.ai_server_finish_request('00000000-0000-4000-a000-0000000000a2', (select id from public.ai_requests limit 1), 'pending') $$, '22023', null, 'A request cannot be re-opened');
select throws_ok($$ select public.ai_server_finish_request('00000000-0000-4000-a000-0000000000a2', (select id from public.ai_requests limit 1), 'refunded') $$, '22023', null, 'Unknown statuses are rejected');
select throws_ok($$ select public.ai_server_finish_request('00000000-0000-4000-a000-0000000000a2', (select id from public.ai_requests limit 1), null) $$, '23502', null, 'A null status is rejected');
select public.ai_server_finish_request('00000000-0000-4000-a000-0000000000a2', (select id from public.ai_requests limit 1), 'failed', 'timeout');
select public.ai_server_finish_request('00000000-0000-4000-a000-0000000000a2', (select id from public.ai_requests limit 1), 'succeeded');
select is((select status from public.ai_requests), 'failed', 'A failed request cannot be turned into a success afterwards');
select is((select error_code from public.ai_requests), 'timeout', 'A second finish leaves the first result untouched');
select is(pg_temp.begin_req('00000000-0000-4000-a000-0000000000a2', 'reflection', '30000000-0000-4000-8000-000000000001'), 'duplicate', 'Retrying a failed key is a duplicate, not a fresh request');

-- User isolation --------------------------------------------------------------------------
-- A pending request of A's, with a known id, created directly as the database owner.
reset role;
insert into public.ai_requests (id, user_id, kind, idempotency_key)
values ('40000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-a000-0000000000a2', 'insights', '30000000-0000-4000-8000-000000000002');

select pg_temp.as_server();
select public.ai_server_finish_request('00000000-0000-4000-a000-0000000000b2', '40000000-0000-4000-8000-0000000000a1', 'succeeded');
select is(pg_temp.status_of('40000000-0000-4000-8000-0000000000a1'), 'pending', 'Closing A''s request as B does nothing');
select is(pg_temp.begin_req('00000000-0000-4000-a000-0000000000b2', 'insights', '30000000-0000-4000-8000-000000000002'), 'started', 'B reusing A''s key starts B''s own request, never A''s');
reset role;
select is((select count(*)::int from public.ai_requests where user_id = '00000000-0000-4000-a000-0000000000a2'), 2, 'B''s calls added nothing to A''s ledger');

select pg_temp.act_as('00000000-0000-4000-a000-0000000000b2');
select throws_ok($$ select public.ai_server_finish_request('00000000-0000-4000-a000-0000000000a2', '40000000-0000-4000-8000-0000000000a1', 'failed') $$, '42501', null, 'A signed-in caller cannot close any request');

-- Abandoned requests and the daily window ----------------------------------------------------
-- Make A's pending request three minutes old, and add 29 more A requests from 25 hours ago.
reset role;
update public.ai_requests set created_at = now() - interval '3 minutes' where id = '40000000-0000-4000-8000-0000000000a1';
insert into public.ai_requests (user_id, kind, idempotency_key, status, created_at)
select '00000000-0000-4000-a000-0000000000a2', 'insights', gen_random_uuid(), 'succeeded', now() - interval '25 hours' from generate_series(1, 29);

select pg_temp.as_server();
select is(pg_temp.begin_req('00000000-0000-4000-a000-0000000000a2', 'insights', '30000000-0000-4000-8000-000000000003', 0, 2), 'started',
          'A request stuck for over two minutes stops blocking, and requests older than 24 hours don''t count');
select is((select status || '/' || error_code from public.ai_requests where id = '40000000-0000-4000-8000-0000000000a1'), 'failed/abandoned',
          'The stuck request is closed as abandoned');
select public.ai_server_finish_request('00000000-0000-4000-a000-0000000000a2', (select id from public.ai_requests where idempotency_key = '30000000-0000-4000-8000-000000000003'), 'failed');
select is(pg_temp.begin_req('00000000-0000-4000-a000-0000000000a2', 'insights', '30000000-0000-4000-8000-000000000004', 0, 2), 'rate',
          'The abandoned request still counts towards the daily cap');

select * from finish();
rollback;
