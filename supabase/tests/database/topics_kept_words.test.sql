-- Topics, topic-entry links, kept words and AI topic talks: ownership, limits, cascades, and
-- the server-only rule for topic talks.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(52);

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-4000-a000-0000000000a3', 'topics-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-0000000000b3', 'topics-b@example.test', 'authenticated', 'authenticated');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.act_as_anon() returns void language sql as $$
  select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
$$;
-- The server's side (Edge Functions with the server key), for whichever user is acting.
create function pg_temp.start(kind text, key uuid) returns uuid language sql security definer as $$
  select (public.ai_server_begin_request(auth.uid(), kind, key, 0, 50) ->> 'request_id')::uuid;
$$;
create function pg_temp.finish(id uuid) returns void language sql security definer as $$
  select public.ai_server_finish_request(auth.uid(), id, 'succeeded');
$$;
create function pg_temp.save_talk(topic text, req uuid, msg text default 'Fictional topic message') returns void language sql security definer as $$
  insert into public.ai_topic_talks (user_id, topic_id, request_id, style, message, output, schema_version, prompt_version, provider, model)
  values (auth.uid(), topic, req, 'understand', msg, '{"schema_version":"topic-talk-1","reply":"Fictional reply"}', 'topic-talk-1', 'test', 'groq', 'openai/gpt-oss-120b');
$$;

select ok(
  (select bool_and(relrowsecurity) from pg_class
    where oid in ('public.topics'::regclass, 'public.topic_entries'::regclass,
                  'public.kept_words'::regclass, 'public.ai_topic_talks'::regclass)),
  'RLS is enabled on all four tables');

-- Fixtures and limits -------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-a000-0000000000a3');
insert into public.entries (id, written_at, body) values ('t-e1', now(), 'Fictional entry one'), ('t-e2', now(), 'Fictional entry two');

select lives_ok($$ insert into public.topics (id, name) values ('t1', 'Work') $$, 'A topic can be created');
select is((select status from public.topics where id = 't1'), 'open', 'A new topic is open');
select is((select resolved_at from public.topics where id = 't1'), null, 'A new topic has no resolved date');
select throws_ok($$ insert into public.topics (id, name) values ('t9', repeat('x', 41)) $$, '23514', null, 'Topic names over 40 characters are rejected');
select throws_ok($$ insert into public.topics (id, name) values ('t9', '') $$, '23514', null, 'Empty topic names are rejected');
select throws_ok($$ insert into public.topics (id, name) values ('t9', '   ') $$, '23514', null, 'Blank topic names are rejected');
select throws_ok($$ insert into public.topics (id, name, status) values ('t9', 'Home', 'closed') $$, '23514', null, 'Unknown statuses are rejected');
select throws_ok($$ update public.topics set what_helped = repeat('x', 201) where id = 't1' $$, '23514', null, 'what_helped over 200 characters is rejected');
select lives_ok($$ update public.topics set name = 'Work life', status = 'resolved', resolved_at = now(), what_helped = 'A walk', check_in_shown_at = now() where id = 't1' $$,
  'A topic can be renamed, resolved and marked checked in on');
select lives_ok($$ insert into public.topics (id, name) values ('t2', 'Sleep') $$, 'A second topic can be created');
update public.topics set updated_at = '2000-01-01' where id = 't2';
select ok((select updated_at > '2001-01-01' from public.topics where id = 't2'), 'Changing a topic refreshes updated_at');

select lives_ok($$ insert into public.topic_entries (topic_id, entry_id) values ('t1', 't-e1'), ('t1', 't-e2'), ('t2', 't-e1') $$, 'Entries can be linked to topics');
select throws_ok($$ insert into public.topic_entries (topic_id, entry_id) values ('t1', 't-e1') $$, '23505', null, 'An entry links to a topic only once');
select throws_ok($$ insert into public.topic_entries (topic_id, entry_id) values ('t1', 'missing') $$, '23503', null, 'A link needs an existing entry');
select throws_ok($$ insert into public.topic_entries (topic_id, entry_id) values ('missing', 't-e1') $$, '23503', null, 'A link needs an existing topic');

select lives_ok($$ insert into public.kept_words (id, text, source_kind, source_entry_id) values ('k1', 'Fictional kept words', 'reflection', 't-e1') $$, 'Kept words can be saved');
select lives_ok($$ insert into public.kept_words (id, text, source_kind, source_topic_id) values ('k2', 'Words from a topic talk', 'topic', 't1') $$, 'Kept words can come from a topic');
select throws_ok($$ insert into public.kept_words (id, text, source_kind, source_entry_id) values ('k3', repeat('x', 1201), 'follow_up', 't-e1') $$, '23514', null, 'Kept words over 1200 characters are rejected');
select throws_ok($$ insert into public.kept_words (id, text, source_kind, source_entry_id) values ('k3', '   ', 'follow_up', 't-e1') $$, '23514', null, 'Empty kept words are rejected');
select throws_ok($$ insert into public.kept_words (id, text, source_kind, source_entry_id) values ('k3', 'Words', 'chat', 't-e1') $$, '23514', null, 'Unknown kept-word sources are rejected');
select throws_ok($$ insert into public.kept_words (id, text, source_kind) values ('k3', 'Words', 'topic') $$, '23514', null, 'Words from a topic must name the topic');
select throws_ok($$ insert into public.kept_words (id, text, source_kind, source_topic_id) values ('k3', 'Words', 'reflection', 't1') $$, '23514', null, 'Words from a reflection must name the entry');
select throws_ok($$ insert into public.kept_words (id, text, source_kind, source_entry_id) values ('k3', 'Words', 'reflection', repeat('x', 101)) $$, '23514', null, 'Source ids over 100 characters are rejected');

-- Sync writes with upserts, which need update rights.
select lives_ok($$ insert into public.topic_entries (topic_id, entry_id) values ('t1', 't-e1') on conflict (user_id, topic_id, entry_id) do update set created_at = excluded.created_at $$, 'Topic links can be upserted');
select lives_ok($$ insert into public.kept_words (id, text, source_kind, source_entry_id) values ('k1', 'Fictional kept words, edited', 'reflection', 't-e1') on conflict (user_id, id) do update set text = excluded.text $$, 'Kept words can be upserted');

-- Other accounts ------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-a000-0000000000b3');
select is((select count(*) from public.topics)::int, 0, 'B sees none of A''s topics');
select is((select count(*) from public.topic_entries)::int, 0, 'B sees none of A''s topic links');
select is((select count(*) from public.kept_words)::int, 0, 'B sees none of A''s kept words');
select throws_ok($$ insert into public.topics (user_id, id, name) values ('00000000-0000-4000-a000-0000000000a3', 'spoof', 'Spoof') $$, '42501', null, 'B cannot create a topic for A');
select throws_ok($$ insert into public.kept_words (user_id, id, text, source_kind) values ('00000000-0000-4000-a000-0000000000a3', 'spoof', 'Spoof', 'topic') $$, '42501', null, 'B cannot save kept words for A');
select throws_ok($$ insert into public.topic_entries (user_id, topic_id, entry_id) values ('00000000-0000-4000-a000-0000000000a3', 't2', 't-e2') $$, '42501', null, 'B cannot link entries for A');
update public.topics set name = 'Hijacked';
delete from public.topics;
delete from public.topic_entries;
delete from public.kept_words;
select pg_temp.act_as_anon();
select throws_ok($$ select count(*) from public.topics $$, '42501', null, 'Signed-out callers cannot read topics');

-- Topic talks are server-only -------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-a000-0000000000a3');
select is((select name from public.topics where id = 't2'), 'Sleep', 'B''s update and deletes changed nothing of A''s');
select is((select count(*) from public.topic_entries)::int, 3, '... including the links');
select isnt(pg_temp.start('follow_up', '30000000-0000-4000-8000-000000000001'), null, 'A request starts in the ledger');
select lives_ok($$ select pg_temp.save_talk('t1', (select id from public.ai_requests where idempotency_key = '30000000-0000-4000-8000-000000000001')) $$,
  'The server saves a topic talk');
select pg_temp.finish((select id from public.ai_requests where idempotency_key = '30000000-0000-4000-8000-000000000001'));
select pg_temp.start('follow_up', '30000000-0000-4000-8000-000000000002');
select throws_ok($$ insert into public.ai_topic_talks (topic_id, request_id, style, message, output, schema_version, prompt_version, provider, model)
  values ('t2', (select id from public.ai_requests where idempotency_key = '30000000-0000-4000-8000-000000000002'), 'understand', 'forged', '{}', 'v', 'v', 'groq', 'm') $$,
  '42501', null, 'A signed-in caller cannot write a topic talk');
select pg_temp.save_talk('t2', (select id from public.ai_requests where idempotency_key = '30000000-0000-4000-8000-000000000002'));
select pg_temp.finish((select id from public.ai_requests where idempotency_key = '30000000-0000-4000-8000-000000000002'));
select is((select count(*) from public.ai_topic_talks)::int, 2, 'The owner reads their topic talks');
select pg_temp.act_as('00000000-0000-4000-a000-0000000000b3');
select is((select count(*) from public.ai_topic_talks)::int, 0, 'B sees none of A''s topic talks');
delete from public.ai_topic_talks;
select pg_temp.act_as('00000000-0000-4000-a000-0000000000a3');
select is((select count(*) from public.ai_topic_talks)::int, 2, 'B''s delete removed none of A''s topic talks');

-- Deletion rules --------------------------------------------------------------------------------
delete from public.entries where id = 't-e1';
select is((select count(*) from public.topic_entries where entry_id = 't-e1')::int, 0, 'Deleting an entry removes its topic links');
select is((select count(*) from public.topic_entries)::int, 1, '... and leaves other links');
select is((select count(*) from public.kept_words)::int, 2, '... and keeps the kept words');
select is((select count(*) from public.topic_entries where topic_id = 't1')::int, 1, 'The topic still has a link before it is deleted');
delete from public.topics where id = 't1';
select is((select count(*) from public.topic_entries where topic_id = 't1')::int, 0, 'Deleting a topic deletes its links');
select is((select count(*) from public.ai_topic_talks where topic_id = 't1')::int, 0, '... and its topic talks');
select is((select count(*) from public.kept_words where id = 'k2')::int, 1, '... but keeps words kept from it');
select is((select count(*) from public.ai_topic_talks)::int, 1, 'Other topics keep their talks');
select public.delete_ai_outputs();
select is((select count(*) from public.ai_topic_talks)::int, 0, '"Delete AI outputs" deletes topic talks');
select is((select count(*) from public.topics where id = 't2')::int, 1, '... and leaves the topics');

-- Account deletion --------------------------------------------------------------------------------
reset role;
delete from auth.users where id = '00000000-0000-4000-a000-0000000000a3';
select is((select count(*) from public.topics where user_id = '00000000-0000-4000-a000-0000000000a3')::int
        + (select count(*) from public.kept_words where user_id = '00000000-0000-4000-a000-0000000000a3')::int, 0,
  'Deleting the account deletes its topics and kept words');

select * from finish();
rollback;
