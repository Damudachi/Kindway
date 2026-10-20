-- Kindway Phase 4A: recorded, versioned, provider-specific consent to AI processing.
--
-- Two independent scopes, each granted and withdrawn on its own:
--   entry_reflection      a reflection on one entry the user explicitly submits
--   cross_entry_analysis  an on-demand review across entries in a period the user picks
--
-- Each row is one grant. Withdrawing sets revoked_at; it is never cleared again, so the table is
-- an append-only history of what the user agreed to and when. Granting again (for example after
-- the disclosure changed) closes the active row and adds a new one. At most one active row per
-- user and scope.
--
-- The AI Edge Functions (Phase 4B) must check public.ai_consent_active() with the caller's own
-- token for every request, so a withdrawal blocks AI processing on the server, not only in the app.
--
-- Retention: consent rows stay while the account exists, as the record of the user's choices.
-- They have no delete policy; deleting the auth user cascades to them.

create table public.ai_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  scope text not null check (scope in ('entry_reflection', 'cross_entry_analysis')),
  -- Version of the consent wording the user saw.
  consent_version text not null check (char_length(consent_version) between 1 and 40),
  -- Version of the data-processing and retention disclosure the user saw.
  disclosure_version text not null check (char_length(disclosure_version) between 1 and 80),
  provider text not null check (char_length(provider) between 1 and 60),
  -- The model named in the disclosure, for the record. Not used to authorize requests.
  model_ref text not null check (char_length(model_ref) between 1 and 120),
  accepted_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (revoked_at is null or revoked_at >= accepted_at)
);

create unique index ai_consents_one_active_idx on public.ai_consents (user_id, scope) where revoked_at is null;
create index ai_consents_user_scope_idx on public.ai_consents (user_id, scope, accepted_at desc);

-- Integrity: timestamps come from the server, and a row can only ever be withdrawn.
create function public.ai_consents_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.revoked_at is not null then
      raise exception 'A consent is recorded as active' using errcode = 'check_violation';
    end if;
    new.accepted_at := now();
    return new;
  end if;

  if old.revoked_at is not null then
    raise exception 'A withdrawn consent cannot be changed' using errcode = 'check_violation';
  end if;
  if new.revoked_at is null
     or (new.id, new.user_id, new.scope, new.consent_version, new.disclosure_version, new.provider, new.model_ref, new.accepted_at)
        is distinct from
        (old.id, old.user_id, old.scope, old.consent_version, old.disclosure_version, old.provider, old.model_ref, old.accepted_at) then
    raise exception 'A consent can only be withdrawn' using errcode = 'check_violation';
  end if;
  new.revoked_at := now();
  return new;
end;
$$;

create trigger ai_consents_guard before insert or update on public.ai_consents
  for each row execute function public.ai_consents_guard();

alter table public.ai_consents enable row level security;

create policy "Own AI consents: read" on public.ai_consents for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Own AI consents: create" on public.ai_consents for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Own AI consents: withdraw" on public.ai_consents for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.ai_consents from anon, public;
grant select, insert, update on public.ai_consents to authenticated;

-- Grant and withdraw in one transaction each. SECURITY INVOKER: RLS and the guard above apply
-- exactly as for direct writes; these only save the app a round trip and a race.

create function public.grant_ai_consent(
  p_scope text,
  p_consent_version text,
  p_disclosure_version text,
  p_provider text,
  p_model_ref text
)
returns public.ai_consents
language plpgsql
security invoker
set search_path = ''
as $$
declare
  granted public.ai_consents;
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  update public.ai_consents set revoked_at = now()
    where user_id = (select auth.uid()) and scope = p_scope and revoked_at is null;
  insert into public.ai_consents (user_id, scope, consent_version, disclosure_version, provider, model_ref)
    values ((select auth.uid()), p_scope, p_consent_version, p_disclosure_version, p_provider, p_model_ref)
    returning * into granted;
  return granted;
end;
$$;

create function public.revoke_ai_consent(p_scope text)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.ai_consents set revoked_at = now()
    where user_id = (select auth.uid()) and scope = p_scope and revoked_at is null;
$$;

-- The server-side gate. True only when the caller has an active grant for this scope that
-- matches the wording, disclosure and provider the server currently requires.
create function public.ai_consent_active(
  p_scope text,
  p_consent_version text,
  p_disclosure_version text,
  p_provider text
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.ai_consents c
    where c.user_id = (select auth.uid())
      and c.scope = p_scope
      and c.revoked_at is null
      and c.consent_version = p_consent_version
      and c.disclosure_version = p_disclosure_version
      and c.provider = p_provider
  );
$$;

revoke all on function public.ai_consents_guard() from anon, public;
revoke all on function public.grant_ai_consent(text, text, text, text, text) from anon, public;
revoke all on function public.revoke_ai_consent(text) from anon, public;
revoke all on function public.ai_consent_active(text, text, text, text) from anon, public;
grant execute on function public.grant_ai_consent(text, text, text, text, text) to authenticated;
grant execute on function public.revoke_ai_consent(text) to authenticated;
grant execute on function public.ai_consent_active(text, text, text, text) to authenticated;
