-- AI follow-up conversations: their own consent scope, ledger kind, ownership and deletion rules.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-4000-a000-0000000000a2', 'follow-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-0000000000b2', 'follow-b@example.test', 'authenticated', 'authenticated');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.act_as_anon() returns void language sql as $$
  select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
$$;
create function pg_temp.start(kind text, key uuid) returns uuid language sql as $$
  select (public.ai_begin_request(kind, key, 0, 50) ->> 'request_id')::uuid;
$$;
create function pg_temp.finish(id uuid) returns void language sql as $$
  select public.ai_finish_request(id, 'succeeded');
$$;
create function pg_temp.save(entry text, req uuid, msg text default 'Fictional follow-up message') returns void language sql as $$
  insert into public.ai_follow_ups (entry_id, request_id, style, message, output, schema_version, prompt_version, provider, model)
  values (entry, req, 'understand', msg, '{"schema_version":"follow-up-1","reply":"Fictional reply"}', 'follow-up-1', 'test', 'groq', 'openai/gpt-oss-120b');
$$;

select ok((select relrowsecurity from pg_class where oid = 'public.ai_follow_ups'::regclass), 'RLS is enabled on follow-ups');

-- Fixtures -----------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-a000-0000000000a2');
insert into public.entries (id, written_at, body) values ('f1', now(), 'Fictional entry one'), ('f2', now(), 'Fictional entry two');
select pg_temp.act_as('00000000-0000-4000-a000-0000000000b2');
insert into public.entries (id, written_at, body) values ('fb', now(), 'Fictional entry of B');

-- Consent: a separate scope ------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-a000-0000000000a2');
select lives_ok($$ select public.grant_ai_consent('entry_reflection', '1', 'groq-default-retention-2026-10-20', 'groq', 'openai/gpt-oss-120b') $$, 'Reflection consent can be granted');
select is(public.ai_consent_active('follow_up', '1', 'groq-default-retention-2026-10-20', 'groq'), false, 'Reflection consent does not grant follow-ups');
select lives_ok($$ select public.grant_ai_consent('follow_up', '1', 'groq-default-retention-2026-10-20', 'groq', 'openai/gpt-oss-120b') $$, 'Follow-up consent can be granted');
select is(public.ai_consent_active('follow_up', '1', 'groq-default-retention-2026-10-20', 'groq'), true, 'Follow-up consent is active for the current terms');
select is(public.ai_consent_active('follow_up', '0', 'groq-default-retention-2026-10-20', 'groq'), false, 'An older follow-up consent version does not count');
select is(public.ai_consent_active('cross_entry_analysis', '1', 'groq-default-retention-2026-10-20', 'groq'), false, 'Follow-up consent does not grant reviews');
select lives_ok($$ select public.revoke_ai_consent('follow_up') $$, 'Follow-up consent can be withdrawn');
select is(public.ai_consent_active('follow_up', '1', 'groq-default-retention-2026-10-20', 'groq'), false, 'A withdrawn follow-up consent does not count');
select is(public.ai_consent_active('entry_reflection', '1', 'groq-default-retention-2026-10-20', 'groq'), true, 'Withdrawing follow-ups leaves reflection consent as it was');
select throws_ok($$ select public.grant_ai_consent('chat_everything', '1', 'x', 'groq', 'm') $$, '23514', null, 'Unknown scopes are rejected');

-- Saving an exchange -------------------------------------------------------------------------
select isnt(pg_temp.start('follow_up', '20000000-0000-4000-8000-000000000001'), null, 'A follow-up request starts in the ledger');
select lives_ok($$ select pg_temp.save('f1', (select id from public.ai_requests where idempotency_key = '20000000-0000-4000-8000-000000000001')) $$,
  'An exchange is saved against the caller''s own pending follow-up request');
select throws_ok($$ select pg_temp.save('f1', (select id from public.ai_requests where idempotency_key = '20000000-0000-4000-8000-000000000001')) $$,
  '23505', null, 'One exchange per request');
select pg_temp.finish((select id from public.ai_requests where idempotency_key = '20000000-0000-4000-8000-000000000001'));
select throws_ok($$ select pg_temp.save('f2', (select id from public.ai_requests where idempotency_key = '20000000-0000-4000-8000-000000000001')) $$,
  '42501', null, 'Nothing can be saved against a finished request');

select pg_temp.start('reflection', '20000000-0000-4000-8000-000000000002');
select throws_ok($$ select pg_temp.save('f1', (select id from public.ai_requests where idempotency_key = '20000000-0000-4000-8000-000000000002')) $$,
  '42501', null, 'A reflection request cannot carry a follow-up');
select pg_temp.finish((select id from public.ai_requests where idempotency_key = '20000000-0000-4000-8000-000000000002'));

select pg_temp.start('follow_up', '20000000-0000-4000-8000-000000000003');
select throws_ok($$ select pg_temp.save('fb', (select id from public.ai_requests where idempotency_key = '20000000-0000-4000-8000-000000000003')) $$,
  '23503', null, 'A conversation cannot be attached to another account''s entry');
select throws_ok($$ select pg_temp.save('f2', (select id from public.ai_requests where idempotency_key = '20000000-0000-4000-8000-000000000003'), repeat('x', 2001)) $$,
  '23514', null, 'Messages over the limit are rejected');
select pg_temp.save('f2', (select id from public.ai_requests where idempotency_key = '20000000-0000-4000-8000-000000000003'));
select pg_temp.finish((select id from public.ai_requests where idempotency_key = '20000000-0000-4000-8000-000000000003'));

select throws_ok($$ update public.ai_follow_ups set message = 'changed' $$, '42501', null, 'Saved exchanges cannot be edited');

-- Other accounts ------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-a000-0000000000b2');
select is((select count(*) from public.ai_follow_ups)::int, 0, 'B sees none of A''s conversations');
delete from public.ai_follow_ups;
select pg_temp.start('follow_up', '20000000-0000-4000-8000-000000000004');
select throws_ok($$ insert into public.ai_follow_ups (user_id, entry_id, request_id, style, message, output, schema_version, prompt_version, provider, model)
  values ('00000000-0000-4000-a000-0000000000a2', 'f1', (select id from public.ai_requests where idempotency_key = '20000000-0000-4000-8000-000000000004'),
          'understand', 'spoof', '{}', 'v', 'v', 'groq', 'm') $$, '42501', null, 'B cannot write into A''s conversation');
select pg_temp.act_as_anon();
select throws_ok($$ select count(*) from public.ai_follow_ups $$, '42501', null, 'Signed-out callers cannot read conversations');

-- Deletion rules ------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-a000-0000000000a2');
select is((select count(*) from public.ai_follow_ups)::int, 2, 'B''s delete attempt removed nothing of A''s');
delete from public.entries where id = 'f1';
select is((select count(*) from public.ai_follow_ups where entry_id = 'f1')::int, 0, 'Deleting an entry deletes its conversation');
select public.delete_ai_outputs();
select is((select count(*) from public.ai_follow_ups)::int, 0, '"Delete AI outputs" deletes follow-up conversations');
select is((select count(*) from public.entries where id = 'f2')::int, 1, '... and leaves the entries');

-- Account deletion -----------------------------------------------------------------------------
select pg_temp.start('follow_up', '20000000-0000-4000-8000-000000000005');
select pg_temp.save('f2', (select id from public.ai_requests where idempotency_key = '20000000-0000-4000-8000-000000000005'));
reset role;
delete from auth.users where id = '00000000-0000-4000-a000-0000000000a2';
select is((select count(*) from public.ai_follow_ups where user_id = '00000000-0000-4000-a000-0000000000a2')::int, 0, 'Deleting the account deletes its conversations');

select * from finish();
rollback;
