-- AI outputs and the request ledger: ownership, limits, duplicate protection and deletion rules.
-- Since Phase 7 only the server (service_role, used by the Edge Functions with the verified user
-- id) opens requests and writes AI rows; signed-in callers can read and delete their own.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-4000-a000-0000000000a1', 'outputs-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-0000000000b1', 'outputs-b@example.test', 'authenticated', 'authenticated');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.act_as_anon() returns void language sql as $$
  select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
$$;
create function pg_temp.as_server() returns void language sql as $$
  select set_config('role', 'service_role', true), set_config('request.jwt.claims', '{"role":"service_role"}', true);
$$;
create function pg_temp.begin_req(uid uuid, kind text, key uuid, cooldown integer default 0, daily integer default 50) returns text language sql as $$
  select public.ai_server_begin_request(uid, kind, key, cooldown, daily) ->> 'outcome';
$$;
create function pg_temp.req_id(key uuid) returns uuid language sql security definer as $$
  select id from public.ai_requests where idempotency_key = key;
$$;

select ok((select bool_and(relrowsecurity) from pg_class where oid in
  ('public.ai_requests'::regclass, 'public.ai_reflections'::regclass, 'public.ai_insights'::regclass, 'public.ai_insight_sources'::regclass)),
  'RLS is enabled on every AI table');

-- Fixtures: A and B each have entries --------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-a000-0000000000a1');
insert into public.entries (id, written_at, body) values ('e1', now(), 'Fictional entry one'), ('e2', now(), 'Fictional entry two'), ('e3', now(), 'Fictional entry three');
select pg_temp.act_as('00000000-0000-4000-a000-0000000000b1');
insert into public.entries (id, written_at, body) values ('b1', now(), 'Fictional entry of B');

-- Request ledger (as the server, for A) -------------------------------------------------------
select pg_temp.as_server();
select is(pg_temp.begin_req('00000000-0000-4000-a000-0000000000a1', 'reflection', '10000000-0000-4000-8000-000000000001'), 'started', 'A request starts');
select is(pg_temp.begin_req('00000000-0000-4000-a000-0000000000a1', 'reflection', '10000000-0000-4000-8000-000000000001'), 'duplicate', 'The same key again is a duplicate, not a new request');
select is((public.ai_server_begin_request('00000000-0000-4000-a000-0000000000a1', 'reflection', '10000000-0000-4000-8000-000000000001', 0, 50)) ->> 'status', 'pending', 'A duplicate reports the original request''s status');
select is(pg_temp.begin_req('00000000-0000-4000-a000-0000000000a1', 'reflection', '10000000-0000-4000-8000-000000000002'), 'busy', 'A second request waits while one is in progress');
select is(pg_temp.begin_req('00000000-0000-4000-a000-0000000000a1', 'insights', '10000000-0000-4000-8000-000000000003'), 'busy', 'One request at a time across both kinds');
select is((select count(*)::int from public.ai_requests), 1, 'Refused requests are not recorded');

-- Signed-in callers can't touch the ledger or write AI rows ----------------------------------
select pg_temp.act_as('00000000-0000-4000-a000-0000000000a1');
select throws_ok($$ insert into public.ai_requests (kind, idempotency_key) values ('reflection', gen_random_uuid()) $$,
                 '42501', null, 'The ledger cannot be written directly');
select throws_ok($$ update public.ai_requests set status = 'failed' $$, '42501', null, 'The ledger cannot be edited directly');
select throws_ok($$ delete from public.ai_requests $$, '42501', null, 'The ledger cannot be deleted to reset limits');
select throws_ok($$ select public.ai_server_begin_request('00000000-0000-4000-a000-0000000000a1', 'reflection', gen_random_uuid(), 0, 50) $$,
                 '42501', null, 'A signed-in caller cannot open a request');
select throws_ok($$ select public.ai_begin_request('reflection', gen_random_uuid(), 0, 50) $$, '42883', null, 'The old caller-run ledger function is gone');
select throws_ok($$ insert into public.ai_reflections (entry_id, request_id, style, output, schema_version, prompt_version, provider, model, entry_updated_at)
                    values ('e1', pg_temp.req_id('10000000-0000-4000-8000-000000000001'), 'listen', '{"acknowledgment":"forged"}', 'r1', 'p1', 'groq', 'm', now()) $$,
                 '42501', null, 'A signed-in caller cannot write a reflection, even against their own open request');
select throws_ok($$ insert into public.ai_insights (request_id, period, range_start, range_end, entry_count, output, schema_version, prompt_version, provider, model)
                    values (pg_temp.req_id('10000000-0000-4000-8000-000000000001'), 'week', now() - interval '7 days', now(), 1, '{}', 'i1', 'p1', 'groq', 'm') $$,
                 '42501', null, 'or a review');
select throws_ok($$ insert into public.ai_insight_sources (insight_id, entry_id) values (gen_random_uuid(), 'e1') $$,
                 '42501', null, 'or a review''s sources');

-- Saving a reflection (as the server) --------------------------------------------------------
select pg_temp.as_server();
select lives_ok($$ insert into public.ai_reflections (user_id, entry_id, request_id, style, output, schema_version, prompt_version, provider, model, entry_updated_at)
                   values ('00000000-0000-4000-a000-0000000000a1', 'e1', pg_temp.req_id('10000000-0000-4000-8000-000000000001'), 'listen', '{"acknowledgment":"x"}', 'r1', 'p1', 'groq', 'm', now()) $$,
                'The server saves a reflection against the user''s request');
select lives_ok($$ select public.ai_server_finish_request('00000000-0000-4000-a000-0000000000a1', pg_temp.req_id('10000000-0000-4000-8000-000000000001'), 'succeeded') $$, 'The request is closed');
select is((select status from public.ai_requests where idempotency_key = '10000000-0000-4000-8000-000000000001'), 'succeeded', 'Closing marks it succeeded');
select throws_ok($$ insert into public.ai_reflections (user_id, entry_id, request_id, style, output, schema_version, prompt_version, provider, model, entry_updated_at)
                    values ('00000000-0000-4000-a000-0000000000a1', 'e2', pg_temp.req_id('10000000-0000-4000-8000-000000000001'), 'listen', '{"acknowledgment":"y"}', 'r1', 'p1', 'groq', 'm', now()) $$,
                 '23505', null, 'One reflection per request');

select pg_temp.act_as('00000000-0000-4000-a000-0000000000a1');
select is((select count(*)::int from public.ai_reflections), 1, 'A reads the reflection the server wrote');
select throws_ok($$ update public.ai_reflections set output = '{"acknowledgment":"edited"}' $$, '42501', null, 'A saved reflection cannot be edited');

-- Limits ------------------------------------------------------------------------------------
select pg_temp.as_server();
select is(pg_temp.begin_req('00000000-0000-4000-a000-0000000000a1', 'reflection', '10000000-0000-4000-8000-000000000004', 60, 50), 'rate', 'A cooldown applies between requests of the same kind');
select ok((public.ai_server_begin_request('00000000-0000-4000-a000-0000000000a1', 'reflection', '10000000-0000-4000-8000-000000000004', 60, 50) ->> 'retry_after')::int between 1 and 60, 'A rate refusal says when to try again');
select is(pg_temp.begin_req('00000000-0000-4000-a000-0000000000a1', 'reflection', '10000000-0000-4000-8000-000000000005', 0, 1), 'rate', 'The daily cap applies');
select is(pg_temp.begin_req('00000000-0000-4000-a000-0000000000a1', 'reflection', '10000000-0000-4000-8000-000000000006', 0, 2), 'started', 'Under the cap, a new request starts');
select lives_ok($$ select public.ai_server_finish_request('00000000-0000-4000-a000-0000000000a1', pg_temp.req_id('10000000-0000-4000-8000-000000000006'), 'failed', 'timeout') $$, 'A failed request is closed');
select is(pg_temp.begin_req('00000000-0000-4000-a000-0000000000a1', 'reflection', '10000000-0000-4000-8000-000000000007', 0, 2), 'rate', 'Failed requests count towards the cap too');

-- Ownership ---------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-a000-0000000000b1');
select is((select count(*)::int from public.ai_reflections), 0, 'B cannot read A''s reflections');
select is((select count(*)::int from public.ai_requests), 0, 'B cannot read A''s ledger');
select pg_temp.as_server();
select is(pg_temp.begin_req('00000000-0000-4000-a000-0000000000b1', 'reflection', '20000000-0000-4000-8000-000000000001'), 'started', 'B''s limits are separate from A''s');
select throws_ok($$ insert into public.ai_reflections (user_id, entry_id, request_id, style, output, schema_version, prompt_version, provider, model, entry_updated_at)
                    values ('00000000-0000-4000-a000-0000000000b1', 'e1', pg_temp.req_id('20000000-0000-4000-8000-000000000001'), 'listen', '{}', 'r1', 'p1', 'groq', 'm', now()) $$,
                 '23503', null, 'Even the server cannot attach B''s reflection to A''s entry');
select throws_ok($$ insert into public.ai_reflections (user_id, entry_id, request_id, style, output, schema_version, prompt_version, provider, model, entry_updated_at)
                    values ('00000000-0000-4000-a000-0000000000a1', 'e1', pg_temp.req_id('20000000-0000-4000-8000-000000000001'), 'listen', '{}', 'r1', 'p1', 'groq', 'm', now()) $$,
                 '23503', null, 'or A''s reflection to B''s request');
select lives_ok($$ select public.ai_server_finish_request('00000000-0000-4000-a000-0000000000b1', pg_temp.req_id('20000000-0000-4000-8000-000000000001'), 'failed', 'test') $$, 'B''s request is closed');
select is(pg_temp.begin_req('00000000-0000-4000-a000-0000000000b1', 'insights', '20000000-0000-4000-8000-000000000002'), 'started', 'B starts a review');
insert into public.ai_insights (user_id, request_id, period, range_start, range_end, entry_count, output, schema_version, prompt_version, provider, model)
values ('00000000-0000-4000-a000-0000000000b1', pg_temp.req_id('20000000-0000-4000-8000-000000000002'), 'week', now() - interval '7 days', now(), 1, '{}', 'i1', 'p1', 'groq', 'm');
select throws_ok($$ insert into public.ai_insight_sources (user_id, insight_id, entry_id)
                    values ('00000000-0000-4000-a000-0000000000b1', (select id from public.ai_insights limit 1), 'e1') $$,
                 '23503', null, 'A review cannot cite another account''s entry');
select lives_ok($$ insert into public.ai_insight_sources (user_id, insight_id, entry_id)
                   values ('00000000-0000-4000-a000-0000000000b1', (select id from public.ai_insights limit 1), 'b1') $$,
                'A review cites its own account''s entry');

-- Deletion rules ------------------------------------------------------------------------------
select is(pg_temp.begin_req('00000000-0000-4000-a000-0000000000a1', 'insights', '10000000-0000-4000-8000-000000000008'), 'started', 'A starts a review');
insert into public.ai_insights (user_id, request_id, period, range_start, range_end, entry_count, output, schema_version, prompt_version, provider, model)
values ('00000000-0000-4000-a000-0000000000a1', pg_temp.req_id('10000000-0000-4000-8000-000000000008'), 'week', now() - interval '7 days', now(), 2, '{}', 'i1', 'p1', 'groq', 'm');
insert into public.ai_insight_sources (user_id, insight_id, entry_id)
select '00000000-0000-4000-a000-0000000000a1', id, e from public.ai_insights, unnest(array['e2', 'e3']) e
 where user_id = '00000000-0000-4000-a000-0000000000a1';
select lives_ok($$ select public.ai_server_finish_request('00000000-0000-4000-a000-0000000000a1', pg_temp.req_id('10000000-0000-4000-8000-000000000008'), 'succeeded') $$, 'The review request is closed');

select pg_temp.act_as('00000000-0000-4000-a000-0000000000a1');
select lives_ok($$ delete from public.ai_reflections where entry_id = 'e1' $$, 'A can delete their own reflection');
select is((select count(*)::int from public.ai_reflections), 0, 'and it is gone');
delete from public.entries where id = 'e3';
select is((select count(*)::int from public.ai_insights), 0, 'Deleting an entry deletes every AI review that used it');
select is((select count(*)::int from public.ai_insight_sources), 0, 'and its source links');

select pg_temp.act_as('00000000-0000-4000-a000-0000000000b1');
select lives_ok($$ select public.delete_ai_outputs() $$, 'B deletes its AI outputs');
select is((select count(*)::int from public.ai_insights), 0, 'B''s reviews are gone');
select is((select count(*)::int from public.entries), 1, 'Deleting AI outputs leaves entries alone');

select pg_temp.act_as_anon();
select throws_ok($$ select public.ai_server_begin_request('00000000-0000-4000-a000-0000000000b1', 'reflection', gen_random_uuid(), 0, 50) $$, '42501', null, 'Signed-out callers cannot start requests');

-- A review of the latest entries (period 'all') is allowed next to 'week' and 'month'.
select ok((select pg_get_constraintdef(c.oid) from pg_constraint c where c.conname = 'ai_insights_period_check' and c.conrelid = 'public.ai_insights'::regclass) like '%''all''%',
          'A review can cover the latest entries');

select * from finish();
rollback;
