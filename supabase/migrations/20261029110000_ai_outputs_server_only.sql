-- Phase 7, AI provenance, step 3 of 3: only the server writes AI rows.
--
-- Since step 2 the Edge Functions open and close requests with ai_server_begin_request and
-- ai_server_finish_request and write AI rows with the server key, setting the verified user id.
-- This removes what let a signed-in user do the same directly: insert rights on the AI tables and
-- the caller-run ledger functions. So a stored reflection, review or follow-up reply, and its
-- provider and model, can only have come from the functions.
--
-- Users keep reading and deleting their own rows, delete_ai_outputs() and "Clear this
-- conversation". Ownership stays enforced for the server too: every AI row's (user_id, entry_id)
-- and (user_id, request_id) must match an entry and a request of the same user.

drop policy "Own AI reflections: create" on public.ai_reflections;
drop policy "Own AI insights: create" on public.ai_insights;
drop policy "Own AI insight sources: create" on public.ai_insight_sources;
drop policy "Own AI follow-ups: create" on public.ai_follow_ups;

revoke insert on public.ai_reflections, public.ai_insights, public.ai_insight_sources, public.ai_follow_ups from authenticated;

drop function public.ai_begin_request(text, uuid, integer, integer);
drop function public.ai_finish_request(uuid, text, text);
