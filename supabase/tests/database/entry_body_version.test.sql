-- body_updated_at moves only when an entry's text changes, so renaming an entry or marking it
-- "Come back to this" doesn't make its reflection look written for an earlier version.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users (id, email, aud, role)
values ('00000000-0000-4000-a000-00000000000a', 'user-a@example.test', 'authenticated', 'authenticated');

select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-a000-00000000000a', 'role', 'authenticated')::text, true);

insert into public.entries (id, written_at, title, body, body_updated_at)
values ('e1', now(), 'Fictional title', 'Fictional body.', '2020-01-01T00:00:00Z');

update public.entries set title = 'Fictional rename', revisit = true where id = 'e1';
select is((select body_updated_at from public.entries where id = 'e1'), '2020-01-01T00:00:00Z'::timestamptz, 'a rename or revisit mark keeps the body version');

update public.entries set body_updated_at = now() where id = 'e1';
select is((select body_updated_at from public.entries where id = 'e1'), '2020-01-01T00:00:00Z'::timestamptz, 'the body version cannot be set by hand');

update public.entries set body = 'Fictional body, edited.' where id = 'e1';
select is((select body_updated_at from public.entries where id = 'e1'), now(), 'editing the body moves the body version');

select * from finish();
rollback;
