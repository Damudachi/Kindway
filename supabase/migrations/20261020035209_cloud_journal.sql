-- Kindway Phase 3: cloud copy of the user-created journal data.
--
-- Every table is owned by one auth user and protected by RLS scoped to auth.uid().
-- Rows use the app's existing local ids as text, keyed together with user_id, so local ids
-- never need remapping and every foreign key is (user_id, id): a row can only point at rows
-- of the same account, even if someone guesses another account's ids.
--
-- Not stored here on purpose: simulated reflections, simulated follow-up replies, saved
-- "memory", reminders (device-specific), drafts, and feedback on the fictional sample insights.

-- updated_at bookkeeping ------------------------------------------------------------------

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Profile and preferences -----------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  onboarded boolean not null default false,
  support_style text not null default 'understand'
    check (support_style in ('listen', 'understand', 'honest', 'forward', 'ask')),
  challenge_gently boolean not null default true,
  challenge_level text not null default 'gentle'
    check (challenge_level in ('gentle', 'balanced', 'direct')),
  context_scope text not null default 'relevant'
    check (context_scope in ('relevant', 'current')),
  weekly_patterns boolean not null default true,
  insights_use_compass boolean not null default true,
  -- Whether the on-device simulated reflection previews are shown. A prototype display
  -- preference only: it is NOT consent to send writing to any AI provider.
  reflection_previews text not null default 'unset'
    check (reflection_previews in ('unset', 'ai', 'journal-only')),
  -- When this account first chose to keep a cloud copy of its journal.
  cloud_sync_consented_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Personal compass (at most three areas) --------------------------------------------------

create table public.compass_values (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 100),
  area text not null check (char_length(btrim(area)) between 1 and 80),
  note text not null default '' check (char_length(note) <= 2000),
  ai_may_reference boolean not null default true,
  position smallint not null default 0 check (position between 0 and 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, area)
);

create function public.enforce_compass_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Upserts fire this before their conflict check, so a row that already exists doesn't count.
  if (select count(*) from public.compass_values c where c.user_id = new.user_id and c.id <> new.id) >= 3 then
    raise exception 'A compass holds at most three areas' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Journal entries and their explicit metadata ---------------------------------------------

create table public.entries (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 100),
  written_at timestamptz not null,
  title text not null default '' check (char_length(title) <= 200),
  body text not null check (char_length(btrim(body)) > 0 and char_length(body) <= 100000),
  feelings text[] not null default '{}' check (cardinality(feelings) <= 30),
  gratitude text check (char_length(gratitude) <= 2000),
  revisit boolean not null default false,
  exclude_from_analysis boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index entries_user_written_at_idx on public.entries (user_id, written_at desc);

-- Which compass values an entry is connected to. Removing either side removes the link.
create table public.entry_compass_links (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_id text not null,
  compass_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, entry_id, compass_id),
  foreign key (user_id, entry_id) references public.entries (user_id, id) on delete cascade,
  foreign key (user_id, compass_id) references public.compass_values (user_id, id) on delete cascade
);

create index entry_compass_links_compass_idx on public.entry_compass_links (user_id, compass_id);

-- Tomorrow Bridge -------------------------------------------------------------------------

create table public.tomorrow_actions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 100),
  text text not null check (char_length(btrim(text)) between 1 and 500),
  saved_at timestamptz not null,
  due_on timestamptz not null,
  status text not null check (status in ('open', 'done', 'dismissed')),
  done_at timestamptz,
  outcome text check (outcome in ('helped', 'not-really')),
  source_kind text check (source_kind in ('reflection', 'insights')),
  source_entry_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  check (source_entry_id is null or source_kind = 'reflection'),
  -- Deleting the source entry keeps the step and only drops the link (as on the device).
  foreign key (user_id, source_entry_id) references public.entries (user_id, id)
    on delete set null (source_entry_id)
);

create index tomorrow_actions_source_idx on public.tomorrow_actions (user_id, source_entry_id);

-- Feedback on Patterns & Insights ---------------------------------------------------------

create table public.insight_feedback (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  insight_id text not null check (char_length(insight_id) between 1 and 200 and insight_id not like 'sample:%'),
  feedback text not null check (feedback in ('fits', 'partly', 'not', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, insight_id)
);

-- Triggers --------------------------------------------------------------------------------

create trigger compass_values_limit before insert on public.compass_values
  for each row execute function public.enforce_compass_limit();

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger compass_values_touch before update on public.compass_values
  for each row execute function public.touch_updated_at();
create trigger entries_touch before update on public.entries
  for each row execute function public.touch_updated_at();
create trigger tomorrow_actions_touch before update on public.tomorrow_actions
  for each row execute function public.touch_updated_at();
create trigger insight_feedback_touch before update on public.insight_feedback
  for each row execute function public.touch_updated_at();

-- Row Level Security: each signed-in user sees and changes only their own rows -------------

alter table public.profiles enable row level security;
alter table public.compass_values enable row level security;
alter table public.entries enable row level security;
alter table public.entry_compass_links enable row level security;
alter table public.tomorrow_actions enable row level security;
alter table public.insight_feedback enable row level security;

create policy "Own profile: read" on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Own profile: create" on public.profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Own profile: change" on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own profile: delete" on public.profiles for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Own compass: read" on public.compass_values for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Own compass: create" on public.compass_values for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Own compass: change" on public.compass_values for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own compass: delete" on public.compass_values for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Own entries: read" on public.entries for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Own entries: create" on public.entries for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Own entries: change" on public.entries for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own entries: delete" on public.entries for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Own compass links: read" on public.entry_compass_links for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Own compass links: create" on public.entry_compass_links for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Own compass links: change" on public.entry_compass_links for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own compass links: delete" on public.entry_compass_links for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Own tomorrow actions: read" on public.tomorrow_actions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Own tomorrow actions: create" on public.tomorrow_actions for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Own tomorrow actions: change" on public.tomorrow_actions for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own tomorrow actions: delete" on public.tomorrow_actions for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Own insight feedback: read" on public.insight_feedback for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Own insight feedback: create" on public.insight_feedback for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Own insight feedback: change" on public.insight_feedback for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own insight feedback: delete" on public.insight_feedback for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Least privilege: signed-out (anon) clients get nothing; signed-in clients get row CRUD,
-- still filtered by the policies above.

revoke all on public.profiles, public.compass_values, public.entries, public.entry_compass_links,
  public.tomorrow_actions, public.insight_feedback from anon, public;
grant select, insert, update, delete on public.profiles, public.compass_values, public.entries,
  public.entry_compass_links, public.tomorrow_actions, public.insight_feedback to authenticated;

revoke all on function public.touch_updated_at() from anon, public;
revoke all on function public.enforce_compass_limit() from anon, public;
