-- The server-only ledger functions: the Edge Functions call them with the server key and the
-- user id from the verified token, so signed-in callers can't open or close requests themselves.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-4000-a000-0000000000a5', 'server-ledger-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-0000000000b5', 'server-ledger-b@example.test', 'authenticated', 'authenticated');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.as_server() returns void language sql as $$
  select set_config('role', 'service_role', true),
         set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
$$;
create function pg_temp.status_of(id uuid) returns text language sql security definer as $$
  select status from public.ai_requests where ai_requests.id = status_of.id;
$$;
create function pg_temp.owner_of(id uuid) returns uuid language sql security definer as $$
  select user_id from public.ai_requests where ai_requests.id = owner_of.id;
$$;

-- Definitions and grants --------------------------------------------------------------------
select ok(has_function_privilege('service_role', 'public.ai_server_begin_request(uuid, text, uuid, integer, integer)', 'execute'), 'The server can open requests');
select ok(has_function_privilege('service_role', 'public.ai_server_finish_request(uuid, uuid, text, text)', 'execute'), 'The server can close requests');
select ok(not has_function_privilege('authenticated', 'public.ai_server_begin_request(uuid, text, uuid, integer, integer)', 'execute'), 'Signed-in callers cannot open requests for any user');
select ok(not has_function_privilege('authenticated', 'public.ai_server_finish_request(uuid, uuid, text, text)', 'execute'), 'Signed-in callers cannot close requests for any user');
select ok(not has_function_privilege('anon', 'public.ai_server_begin_request(uuid, text, uuid, integer, integer)', 'execute'), 'anon cannot open requests');

-- The server opens and closes a request for a given user ------------------------------------
select pg_temp.as_server();
create temp table started as
  select public.ai_server_begin_request('00000000-0000-4000-a000-0000000000a5', 'reflection', '30000000-0000-4000-8000-000000000001', 0, 50) as r;
select is((select r ->> 'outcome' from started), 'started', 'A request is started');
select is(pg_temp.owner_of((select (r ->> 'request_id')::uuid from started)), '00000000-0000-4000-a000-0000000000a5'::uuid, 'It belongs to the user the server named');
select is(public.ai_server_begin_request('00000000-0000-4000-a000-0000000000a5', 'reflection', '30000000-0000-4000-8000-000000000001', 0, 50) ->> 'outcome',
          'duplicate', 'The same key again is a duplicate');
select lives_ok($$ select public.ai_server_finish_request('00000000-0000-4000-a000-0000000000b5', (select (r ->> 'request_id')::uuid from started), 'failed') $$,
                'Closing it as another user is ignored');
select is(pg_temp.status_of((select (r ->> 'request_id')::uuid from started)), 'pending', 'and leaves it open');
select lives_ok($$ select public.ai_server_finish_request('00000000-0000-4000-a000-0000000000a5', (select (r ->> 'request_id')::uuid from started), 'succeeded') $$,
                'Its owner''s request is closed');
select is(pg_temp.status_of((select (r ->> 'request_id')::uuid from started)), 'succeeded', 'and is now succeeded');
select throws_ok($$ select public.ai_server_begin_request(null, 'reflection', gen_random_uuid(), 0, 50) $$, '22023', null, 'A missing user id is rejected');
select throws_ok($$ select public.ai_server_begin_request('00000000-0000-4000-a000-0000000000a5', 'reflection', gen_random_uuid(), -1, 50) $$, '22023', null, 'Invalid limits are rejected');
select is(public.ai_server_begin_request('00000000-0000-4000-a000-0000000000a5', 'follow_up', gen_random_uuid(), 0, 50) ->> 'outcome', 'started', 'Follow-ups are a kind of request');

-- A request opened the old way (before the deploy) is closed the new way ---------------------
select pg_temp.act_as('00000000-0000-4000-a000-0000000000b5');
create temp table legacy as select public.ai_begin_request('insights', gen_random_uuid(), 0, 50) as r;
grant select on legacy to service_role;
select pg_temp.as_server();
select lives_ok($$ select public.ai_server_finish_request('00000000-0000-4000-a000-0000000000b5', (select (r ->> 'request_id')::uuid from legacy), 'failed') $$,
                'The server closes a request the old function opened');
select is(pg_temp.status_of((select (r ->> 'request_id')::uuid from legacy)), 'failed', 'and it is closed');

select * from finish();
rollback;
