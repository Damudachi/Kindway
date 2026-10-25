-- When an entry's text last changed, separately from updated_at.
--
-- A reflection records the version of the entry it was written for. It used updated_at, so
-- renaming an entry (or toggling "Come back to this") made the reflection look written for an
-- earlier version on other devices. body_updated_at only moves when the body itself changes.

alter table public.entries add column body_updated_at timestamptz not null default now();

-- Existing reflections recorded updated_at; start from it so they still match.
update public.entries set body_updated_at = updated_at;

create function public.touch_body_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.body is distinct from old.body then
    new.body_updated_at := now();
  else
    new.body_updated_at := old.body_updated_at;
  end if;
  return new;
end;
$$;

revoke all on function public.touch_body_updated_at() from anon, public;

create trigger entries_touch_body before update on public.entries
  for each row execute function public.touch_body_updated_at();
