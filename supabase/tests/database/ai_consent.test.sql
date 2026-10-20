-- AI consent: per-user, per-scope, versioned, append-only, and enforced by ai_consent_active().
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-4000-a000-00000000000a', 'user-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'user-b@example.test', 'authenticated', 'authenticated');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.act_as_anon() returns void language sql as $$
  select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
$$;
-- The terms the server currently requires (fixtures; the real values live in the Edge Function config).
create function pg_temp.entry_ok() returns boolean language sql as $$
  select public.ai_consent_active('entry_reflection', 'test-1', 'test-disclosure-1', 'groq');
$$;
create function pg_temp.cross_ok() returns boolean language sql as $$
  select public.ai_consent_active('cross_entry_analysis', 'test-1', 'test-disclosure-1', 'groq');
$$;

select ok((select relrowsecurity from pg_class where oid = 'public.ai_consents'::regclass), 'RLS is enabled on ai_consents');

-- No consent by default ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-a000-00000000000a');
select is(pg_temp.entry_ok(), false, 'No consent: entry reflections are refused');
select is(pg_temp.cross_ok(), false, 'No consent: cross-entry analysis is refused');

-- Scopes are independent --------------------------------------------------------------------
select lives_ok($$ select public.grant_ai_consent('entry_reflection', 'test-1', 'test-disclosure-1', 'groq', 'openai/gpt-oss-120b') $$,
                'A grants entry reflections');
select is(pg_temp.entry_ok(), true, 'Entry reflections are allowed after the grant');
select is(pg_temp.cross_ok(), false, 'Granting entry reflections does not allow cross-entry analysis');
select is((select user_id from public.ai_consents), '00000000-0000-4000-a000-00000000000a'::uuid, 'The grant is recorded for the caller');
select isnt((select accepted_at from public.ai_consents), null, 'The grant records when it was accepted');

-- Version and provider must match what the server requires ---------------------------------
select is(public.ai_consent_active('entry_reflection', 'test-2', 'test-disclosure-1', 'groq'), false, 'A newer consent wording needs a new grant');
select is(public.ai_consent_active('entry_reflection', 'test-1', 'test-disclosure-2', 'groq'), false, 'A newer disclosure needs a new grant');
select is(public.ai_consent_active('entry_reflection', 'test-1', 'test-disclosure-1', 'other-provider'), false, 'Consent for one provider does not cover another');

-- Granting again replaces the active grant and keeps the history ----------------------------
select lives_ok($$ select public.grant_ai_consent('entry_reflection', 'test-2', 'test-disclosure-1', 'groq', 'openai/gpt-oss-120b') $$,
                'A re-grants under newer wording');
select is((select count(*)::int from public.ai_consents where scope = 'entry_reflection'), 2, 'Both grants are kept');
select is((select count(*)::int from public.ai_consents where scope = 'entry_reflection' and revoked_at is null), 1, 'Only one grant per scope is active');
select is((select consent_version from public.ai_consents where scope = 'entry_reflection' and revoked_at is null), 'test-2', 'The newest grant is the active one');
select throws_ok($$ insert into public.ai_consents (scope, consent_version, disclosure_version, provider, model_ref)
                    values ('entry_reflection', 'test-1', 'test-disclosure-1', 'groq', 'm') $$,
                 '23505', null, 'A second active grant for the same scope is rejected');

-- Integrity of the record -------------------------------------------------------------------
select throws_ok($$ insert into public.ai_consents (scope, consent_version, disclosure_version, provider, model_ref, revoked_at)
                    values ('cross_entry_analysis', 'test-1', 'test-disclosure-1', 'groq', 'm', now()) $$,
                 '23514', null, 'A grant cannot be inserted already withdrawn');
select lives_ok($$ insert into public.ai_consents (scope, consent_version, disclosure_version, provider, model_ref, accepted_at)
                   values ('cross_entry_analysis', 'test-1', 'test-disclosure-1', 'groq', 'm', '2020-01-01') $$,
                'A direct insert works');
select ok((select accepted_at > '2020-01-02' from public.ai_consents where scope = 'cross_entry_analysis'), 'accepted_at is set by the server, not backdated');
select throws_ok($$ update public.ai_consents set consent_version = 'forged' where scope = 'cross_entry_analysis' $$,
                 '23514', null, 'The agreed terms cannot be edited');
select throws_ok($$ insert into public.ai_consents (scope, consent_version, disclosure_version, provider, model_ref)
                    values ('everything', 'test-1', 'test-disclosure-1', 'groq', 'm') $$,
                 '23514', null, 'Unknown scopes are rejected');
select is(pg_temp.cross_ok(), true, 'Cross-entry analysis is allowed after its own grant');

-- Ownership --------------------------------------------------------------------------------
select throws_ok($$ insert into public.ai_consents (user_id, scope, consent_version, disclosure_version, provider, model_ref)
                    values ('00000000-0000-4000-a000-00000000000b', 'entry_reflection', 'test-1', 'test-disclosure-1', 'groq', 'm') $$,
                 '42501', null, 'A cannot record consent for B');

select pg_temp.act_as('00000000-0000-4000-a000-00000000000b');
select is((select count(*)::int from public.ai_consents), 0, 'B cannot read A''s consents');
select is(pg_temp.entry_ok(), false, 'A''s consent does not allow B''s requests');
update public.ai_consents set revoked_at = now();
select public.revoke_ai_consent('entry_reflection');
delete from public.ai_consents;

select pg_temp.act_as('00000000-0000-4000-a000-00000000000a');
select is((select count(*)::int from public.ai_consents where revoked_at is null), 2, 'B could not withdraw or delete A''s consents');

-- Withdrawal blocks requests and is final ---------------------------------------------------
select lives_ok($$ select public.revoke_ai_consent('entry_reflection') $$, 'A withdraws entry reflections');
select is(pg_temp.entry_ok(), false, 'After withdrawal, entry reflections are refused');
select is(pg_temp.cross_ok(), true, 'Withdrawing one scope leaves the other as it was');
select throws_ok($$ update public.ai_consents set revoked_at = null where scope = 'entry_reflection' $$,
                 '23514', null, 'A withdrawn consent cannot be reinstated');
delete from public.ai_consents;
select is((select count(*)::int from public.ai_consents), 3, 'Consent history cannot be deleted by the user');

-- Signed-out clients get nothing ------------------------------------------------------------
select pg_temp.act_as_anon();
select throws_ok($$ select count(*) from public.ai_consents $$, '42501', null, 'anon cannot read consents');
select throws_ok($$ select public.ai_consent_active('entry_reflection', 'test-1', 'test-disclosure-1', 'groq') $$,
                 '42501', null, 'anon cannot call the consent check');

-- Account deletion removes the consent history ----------------------------------------------
reset role;
delete from auth.users where id = '00000000-0000-4000-a000-00000000000a';
select is((select count(*)::int from public.ai_consents where user_id = '00000000-0000-4000-a000-00000000000a'), 0, 'Deleting the account removes its consent records');

select * from finish();
rollback;
