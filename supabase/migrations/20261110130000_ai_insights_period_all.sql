-- AI reviews of the user's latest entries ("all"), alongside "week" and "month".
--
-- A review of the latest entries has no period: it covers up to 25 of the most recent entries
-- however old they are (the limits live in the Edge Function config and in the consent wording
-- for `cross_entry_analysis` v2). Its range runs from the oldest entry sent to the request time.
-- Nothing else changes: the same tables, row security and server-only writes apply.

alter table public.ai_insights drop constraint if exists ai_insights_period_check;
alter table public.ai_insights add constraint ai_insights_period_check check (period in ('week', 'month', 'all'));
