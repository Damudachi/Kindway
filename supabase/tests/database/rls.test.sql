-- Two-user RLS tests: User A and User B can each manage only their own rows.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

-- Fixture accounts (rolled back at the end).
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

-- Every user-data table has RLS on.
select ok((select bool_and(relrowsecurity) from pg_class
           where oid in ('public.profiles'::regclass, 'public.compass_values'::regclass, 'public.entries'::regclass,
                         'public.entry_compass_links'::regclass, 'public.tomorrow_actions'::regclass,
                         'public.insight_feedback'::regclass)),
          'RLS is enabled on every user-data table');

-- User A creates a full set of rows -------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-a000-00000000000a');

select lives_ok($$ insert into public.profiles (user_id, onboarded) values ('00000000-0000-4000-a000-00000000000a', true) $$, 'A creates own profile');
select lives_ok($$ insert into public.compass_values (id, area) values ('c-Work', 'Work') $$, 'A creates a compass value (user_id defaults to A)');
select lives_ok($$ insert into public.entries (id, written_at, title, body, feelings) values ('n1', now(), 'First', 'A private thought', '{tired}') $$, 'A creates an entry');
select lives_ok($$ insert into public.entry_compass_links (entry_id, compass_id) values ('n1', 'c-Work') $$, 'A links own entry to own compass value');
select lives_ok($$ insert into public.tomorrow_actions (id, text, saved_at, due_on, status, source_kind, source_entry_id)
                   values ('t1', 'Walk', now(), now() + interval '1 day', 'open', 'reflection', 'n1') $$, 'A creates a Tomorrow step linked to own entry');
select lives_ok($$ insert into public.insight_feedback (insight_id, feedback) values ('tag:tired', 'fits') $$, 'A saves insight feedback');
select is((select count(*)::int from public.entries), 1, 'A reads own entry');
select lives_ok($$ update public.entries set title = 'Renamed' where id = 'n1' $$, 'A updates own entry');
select is((select title from public.entries where id = 'n1'), 'Renamed', 'A sees own update');

-- Spoofed ownership is rejected.
select throws_ok($$ insert into public.entries (user_id, id, written_at, body) values ('00000000-0000-4000-a000-00000000000b', 'spoof', now(), 'x') $$,
                 '42501', null, 'A cannot insert a row owned by B');
select throws_ok($$ update public.entries set user_id = '00000000-0000-4000-a000-00000000000b' where id = 'n1' $$,
                 '42501', null, 'A cannot hand an own row to B');
select throws_ok($$ insert into public.profiles (user_id) values ('00000000-0000-4000-a000-00000000000b') $$,
                 '42501', null, 'A cannot create a profile for B');

-- User B: isolated from A -----------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-a000-00000000000b');

select is((select count(*)::int from public.entries), 0, 'B cannot read A''s entries');
select is((select count(*)::int from public.profiles), 0, 'B cannot read A''s profile');
select is((select count(*)::int from public.compass_values), 0, 'B cannot read A''s compass');
select is((select count(*)::int from public.entry_compass_links), 0, 'B cannot read A''s compass links');
select is((select count(*)::int from public.tomorrow_actions), 0, 'B cannot read A''s Tomorrow steps');
select is((select count(*)::int from public.insight_feedback), 0, 'B cannot read A''s insight feedback');

update public.entries set body = 'overwritten by B' where id = 'n1';
delete from public.entries where id = 'n1';
delete from public.profiles where user_id = '00000000-0000-4000-a000-00000000000a';
update public.tomorrow_actions set text = 'B was here' where id = 't1';

-- B's own data, including ids that collide with A's.
select lives_ok($$ insert into public.entries (id, written_at, body) values ('n1', now(), 'B''s own entry with the same id') $$, 'B can use the same local id as A');
select lives_ok($$ insert into public.compass_values (id, area) values ('c-Rest', 'Rest') $$, 'B creates own compass value');
-- Cross-account references: B can't point own rows at A's entry or compass value.
select throws_ok($$ insert into public.entry_compass_links (entry_id, compass_id) values ('n1', 'c-Work') $$,
                 '23503', null, 'B cannot link own entry to A''s compass value');
select throws_ok($$ insert into public.tomorrow_actions (id, text, saved_at, due_on, status, source_kind, source_entry_id)
                    values ('t9', 'x', now(), now(), 'open', 'reflection', 'n-only-a-has') $$,
                 '23503', null, 'B cannot point a Tomorrow step at an entry B doesn''t own');
select is((select count(*)::int from public.entries), 1, 'B sees only own entry');

-- A's rows were untouched by B ------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-a000-00000000000a');
select is((select body from public.entries where id = 'n1'), 'A private thought', 'B could not update A''s entry');
select is((select count(*)::int from public.profiles), 1, 'B could not delete A''s profile');
select is((select text from public.tomorrow_actions where id = 't1'), 'Walk', 'B could not update A''s Tomorrow step');
select is((select count(*)::int from public.entries), 1, 'A still sees only own entry, not B''s');

-- Constraints -----------------------------------------------------------------------------
select throws_ok($$ insert into public.entries (id, written_at, body) values ('blank', now(), '   ') $$,
                 '23514', null, 'Blank entries are rejected');
select throws_ok($$ insert into public.insight_feedback (insight_id, feedback) values ('sample:theme:comparison', 'fits') $$,
                 '23514', null, 'Feedback on fictional sample insights is not stored');
select lives_ok($$ insert into public.compass_values (id, area) values ('c-Health', 'Health'), ('c-Family', 'Family') $$, 'A fills the compass to three');
select throws_ok($$ insert into public.compass_values (id, area) values ('c-Fourth', 'Fourth') $$,
                 '23514', 'A compass holds at most three areas', 'A fourth compass area is rejected');
select lives_ok($$ insert into public.compass_values (id, area, note) values ('c-Work', 'Work', 'updated')
                   on conflict (user_id, id) do update set note = excluded.note $$, 'Upserting an existing area works at the limit');

-- Deletion behaviour ----------------------------------------------------------------------
delete from public.entries where id = 'n1';
select is((select count(*)::int from public.entry_compass_links), 0, 'Deleting an entry removes its compass links');
select is((select source_entry_id from public.tomorrow_actions where id = 't1'), null, 'Deleting the source entry keeps the step but drops the link');
select is((select count(*)::int from public.tomorrow_actions), 1, 'The Tomorrow step itself remains');

-- Signed-out clients get nothing ----------------------------------------------------------
select pg_temp.act_as_anon();
select throws_ok($$ select count(*) from public.entries $$, '42501', null, 'anon has no access to entries');
select throws_ok($$ insert into public.entries (user_id, id, written_at, body) values ('00000000-0000-4000-a000-00000000000a', 'x', now(), 'x') $$,
                 '42501', null, 'anon cannot write entries');

-- Deleting an account removes only that account's data ------------------------------------
reset role;
delete from auth.users where id = '00000000-0000-4000-a000-00000000000a';
select is((select count(*)::int from public.entries where user_id = '00000000-0000-4000-a000-00000000000a'), 0, 'Deleting A removes A''s entries');
select is((select count(*)::int from public.compass_values where user_id = '00000000-0000-4000-a000-00000000000a'), 0, 'Deleting A removes A''s compass');
select is((select count(*)::int from public.entries where user_id = '00000000-0000-4000-a000-00000000000b'), 1, 'Deleting A keeps B''s entries');
select is((select count(*)::int from public.compass_values where user_id = '00000000-0000-4000-a000-00000000000b'), 1, 'Deleting A keeps B''s compass');

select * from finish();
rollback;
