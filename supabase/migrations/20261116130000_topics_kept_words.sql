-- Kindway wise friend: topics, kept words and topic talks.
--
-- Every table is owned by one auth user and protected by RLS scoped to auth.uid(), with
-- composite (user_id, id) keys like the rest of the cloud journal.
--
-- - topics: a named thread the user follows across entries. Open or resolved.
-- - topic_entries: which entries belong to a topic. Removing either side removes the link.
-- - kept_words: words the user chose to keep. The source ids are plain text, not foreign keys,
--   so deleting the entry or topic they came from keeps the words.
-- - ai_topic_talks: one AI exchange about a topic. Server-only, like the other AI outputs:
--   owners read and delete their own rows; only the Edge Functions write them.

-- Topics -----------------------------------------------------------------------------------

create table public.topics (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 100),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  what_helped text check (char_length(what_helped) <= 200),
  check_in_shown_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.topic_entries (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  topic_id text not null,
  entry_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, topic_id, entry_id),
  foreign key (user_id, topic_id) references public.topics (user_id, id) on delete cascade,
  foreign key (user_id, entry_id) references public.entries (user_id, id) on delete cascade
);

create index topic_entries_entry_idx on public.topic_entries (user_id, entry_id);

-- Kept words ---------------------------------------------------------------------------------

create table public.kept_words (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 100),
  text text not null check (char_length(btrim(text)) between 1 and 1200),
  source_kind text not null check (source_kind in ('reflection', 'follow_up', 'topic')),
  source_entry_id text check (char_length(source_entry_id) between 1 and 100),
  source_topic_id text check (char_length(source_topic_id) between 1 and 100),
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  -- Words from a topic talk name their topic; words from a reflection or follow-up name their entry.
  check (
    (source_kind = 'topic' and source_topic_id is not null)
    or (source_kind in ('reflection', 'follow_up') and source_entry_id is not null)
  )
);

-- Topic talks (written by the server only) -----------------------------------------------------

create table public.ai_topic_talks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  topic_id text not null,
  request_id uuid not null unique,
  style text not null check (style in ('listen', 'understand', 'honest', 'forward', 'ask')),
  message text not null check (char_length(message) between 1 and 2000),
  output jsonb not null check (jsonb_typeof(output) = 'object' and pg_column_size(output) <= 8000),
  schema_version text not null check (char_length(schema_version) between 1 and 40),
  prompt_version text not null check (char_length(prompt_version) between 1 and 40),
  provider text not null check (char_length(provider) between 1 and 40),
  model text not null check (char_length(model) between 1 and 120),
  created_at timestamptz not null default now(),
  foreign key (user_id, topic_id) references public.topics (user_id, id) on delete cascade,
  foreign key (user_id, request_id) references public.ai_requests (user_id, id) on delete cascade
);

create index ai_topic_talks_topic_idx on public.ai_topic_talks (user_id, topic_id, created_at);

create trigger topics_touch before update on public.topics
  for each row execute function public.touch_updated_at();

-- Row Level Security ---------------------------------------------------------------------------

alter table public.topics enable row level security;
alter table public.topic_entries enable row level security;
alter table public.kept_words enable row level security;
alter table public.ai_topic_talks enable row level security;

create policy "Own topics: read" on public.topics for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Own topics: create" on public.topics for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Own topics: change" on public.topics for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own topics: delete" on public.topics for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Own topic links: read" on public.topic_entries for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Own topic links: create" on public.topic_entries for insert to authenticated
  with check ((select auth.uid()) = user_id);
-- Sync upserts (insert ... on conflict do update), which needs update rights even without a conflict.
create policy "Own topic links: change" on public.topic_entries for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own topic links: delete" on public.topic_entries for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Own kept words: read" on public.kept_words for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Own kept words: create" on public.kept_words for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Own kept words: change" on public.kept_words for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own kept words: delete" on public.kept_words for delete to authenticated
  using ((select auth.uid()) = user_id);

-- No create policy: only the server writes topic talks.
create policy "Own AI topic talks: read" on public.ai_topic_talks for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Own AI topic talks: delete" on public.ai_topic_talks for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Least privilege: signed-out clients get nothing; signed-in clients get only what the app uses.
revoke all on public.topics, public.topic_entries, public.kept_words, public.ai_topic_talks
  from anon, authenticated, public;
grant select, insert, update, delete on public.topics to authenticated;
grant select, insert, update, delete on public.topic_entries, public.kept_words to authenticated;
grant select, delete on public.ai_topic_talks to authenticated;

-- "Delete AI outputs" also deletes topic talks. Same function as in 20261021120000_ai_follow_ups.sql
-- (runs as the caller; grants are kept by create or replace) plus the one new delete.
create or replace function public.delete_ai_outputs()
returns void
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  delete from public.ai_topic_talks where user_id = auth.uid();
  delete from public.ai_follow_ups where user_id = auth.uid();
  delete from public.ai_reflections where user_id = auth.uid();
  delete from public.ai_insights where user_id = auth.uid();
end;
$$;
