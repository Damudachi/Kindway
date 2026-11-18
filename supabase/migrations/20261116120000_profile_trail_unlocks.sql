-- Trail milestones reached (entry counts), kept on the profile so they survive a reinstall or a new
-- device. Only these milestones exist; the app merges by union, so a value is never removed.

alter table public.profiles
  add column trail_unlocks int[] not null default '{}',
  add constraint profiles_trail_unlocks_valid check (trail_unlocks <@ array[7, 30, 50, 100, 200, 365]);
