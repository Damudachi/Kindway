-- profiles.trail_unlocks starts empty and only accepts the known trail milestones.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email, aud, role)
values ('00000000-0000-4000-a000-00000000000a', 'user-a@example.test', 'authenticated', 'authenticated');

select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-a000-00000000000a', 'role', 'authenticated')::text, true);

insert into public.profiles (user_id) values ('00000000-0000-4000-a000-00000000000a');
select is((select trail_unlocks from public.profiles), '{}'::int[], 'a new profile has no unlocks');

select lives_ok($$ update public.profiles set trail_unlocks = '{7,30,365}' $$, 'known milestones are accepted');
select throws_ok($$ update public.profiles set trail_unlocks = '{7,8}' $$, '23514', null, 'an unknown milestone is rejected');
select throws_ok($$ update public.profiles set trail_unlocks = null $$, '23502', null, 'unlocks cannot be null');

select * from finish();
rollback;
