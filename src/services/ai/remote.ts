import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError, type SupabaseClient } from '@supabase/supabase-js';

import type { ChatMessage, Entry, Reflection, SupportStyle } from '@/data/types';
import { CloudError, fail } from '@/services/cloud/repo';
import type { Insight, InsightKind, InsightReview, SourceRef, SuggestedAction } from '@/services/insights/types';

import type { AiError, FollowUpError, FollowUpResult, ReflectionResult } from './types';

/**
 * The real AI service: Supabase Edge Functions that check consent, read the entry as the
 * signed-in user, call the provider and validate the reply. The app never holds a provider key
 * and never sends entry text itself; it sends ids, and the server reads what the user allowed.
 */

/** Calls a function as the signed-in user; `offline` when it couldn't be reached at all. */
export type Invoke = (fn: 'generate-reflection' | 'generate-insights' | 'generate-follow-up', body: Record<string, unknown>) => Promise<{ status: number; body: unknown } | 'offline'>;

export function supabaseInvoke(client: SupabaseClient): Invoke {
  return async (fn, body) => {
    try {
      const { data, error } = await client.functions.invoke(fn, { body });
      if (!error) return { status: 200, body: data };
      if (error instanceof FunctionsHttpError) {
        const res = error.context as Response;
        return { status: res.status, body: await res.json().catch(() => null) };
      }
      if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) return 'offline';
      return { status: 0, body: null };
    } catch {
      return 'offline';
    }
  };
}

/** A fresh idempotency key per user action. Uniqueness, not secrecy, is what matters here. */
export function newRequestKey() {
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${'89ab'[Math.floor(Math.random() * 4)]}${hex(3)}-${hex(12)}`;
}

/** Server error codes, as the states the app shows. */
const ERRORS: Record<string, AiError> = {
  consent_required: 'consent',
  entry_not_found: 'not-synced',
  entry_too_long: 'too-long',
  rate_limited: 'rate',
  provider_busy: 'rate',
  busy: 'busy',
  in_progress: 'busy',
  timeout: 'timeout',
  invalid_response: 'invalid',
  provider_unavailable: 'unavailable',
  not_configured: 'unavailable',
  server_error: 'unavailable',
};

const errorOf = (body: unknown): string | undefined => (isObject(body) && typeof body.error === 'string' ? body.error : undefined);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);

// Daily reflection ------------------------------------------------------------------------

/** Turns the server's stored reflection into the app's Reflection, or null if it's malformed. */
export function toReflection(stored: unknown, basedOn: string): Reflection | null {
  if (!isObject(stored) || !isObject(stored.output)) return null;
  const o = stored.output;
  const acknowledge = str(o.acknowledgment);
  if (!acknowledge || typeof stored.id !== 'string') return null;
  const compass = isObject(o.compass_connection) && str(o.compass_connection.value) && str(o.compass_connection.text) ? o.compass_connection : null;
  return {
    style: stored.style as SupportStyle,
    source: 'ai',
    ai: { id: stored.id, provider: String(stored.provider), model: String(stored.model), createdAt: String(stored.created_at) },
    acknowledge,
    ...(str(o.events_and_interpretations) && { clarify: str(o.events_and_interpretations) }),
    ...(str(o.possible_perspective) && { perspective: str(o.possible_perspective) }),
    ...(compass && { longGame: { value: String(compass.value), text: String(compass.text) } }),
    ...(str(o.suggested_step) && { nextStep: str(o.suggested_step) }),
    ...(str(o.reflection_question) && { question: str(o.reflection_question) }),
    basedOn,
  };
}

export async function requestAiReflection(invoke: Invoke, entry: Pick<Entry, 'id' | 'body'>, style: SupportStyle, key = newRequestKey()): Promise<ReflectionResult> {
  const res = await invoke('generate-reflection', { entry_id: entry.id, style, idempotency_key: key });
  if (res === 'offline') return { ok: false, error: 'offline' };
  if (res.status === 200 && isObject(res.body)) {
    if (res.body.status === 'safety') return { ok: false, error: 'safety' };
    const reflection = res.body.status === 'ready' ? toReflection(res.body.reflection, entry.body) : null;
    return reflection ? { ok: true, reflection } : { ok: false, error: 'invalid' };
  }
  return { ok: false, error: ERRORS[errorOf(res.body) ?? ''] ?? 'failed' };
}

// Follow-up conversation ---------------------------------------------------------------------

/** At most this many earlier exchanges are offered as context; the server may use fewer. */
export const FOLLOW_UP_CONTEXT_TURNS = 3;

const FOLLOW_UP_ERRORS: Record<string, FollowUpError> = { ...ERRORS, context_not_found: 'conversation-changed', message_too_long: 'too-long' };

export type FollowUpAsk = {
  entryId: string;
  message: string;
  style: SupportStyle;
  /** Stored ids of the earlier AI replies shown in this conversation, oldest first. */
  contextIds: string[];
  /** The AI reflection shown with the entry, if any. Simulated ones are never sent. */
  reflectionId: string | null;
};

export async function requestAiFollowUp(invoke: Invoke, ask: FollowUpAsk, key = newRequestKey()): Promise<FollowUpResult> {
  const res = await invoke('generate-follow-up', {
    entry_id: ask.entryId,
    message: ask.message,
    style: ask.style,
    idempotency_key: key,
    context_ids: ask.contextIds.slice(-FOLLOW_UP_CONTEXT_TURNS),
    reflection_id: ask.reflectionId,
  });
  if (res === 'offline') return { ok: false, error: 'offline' };
  if (res.status === 200 && isObject(res.body)) {
    if (res.body.status === 'safety') return { ok: false, error: 'safety' };
    const f = res.body.status === 'ready' && isObject(res.body.follow_up) ? res.body.follow_up : null;
    const reply = f && isObject(f.output) ? str(f.output.reply) : undefined;
    if (!f || !reply || typeof f.id !== 'string' || f.entry_id !== ask.entryId) return { ok: false, error: 'invalid' };
    const message: ChatMessage = {
      id: `ai:${f.id}`,
      from: 'kindway',
      text: reply,
      source: 'ai',
      ai: { id: f.id, provider: String(f.provider), model: String(f.model), createdAt: String(f.created_at) },
    };
    return { ok: true, message };
  }
  return { ok: false, error: FOLLOW_UP_ERRORS[errorOf(res.body) ?? ''] ?? 'failed' };
}

// Review across entries -------------------------------------------------------------------

export type AiReviewError = AiError | 'selection-changed' | 'insufficient' | 'too-many' | 'too-much-text';
export type AiReviewResult = { status: 'ready'; review: InsightReview } | { status: 'safety' } | { status: 'error'; error: AiReviewError; limit?: number };

const REVIEW_ERRORS: Record<string, AiReviewError> = {
  ...ERRORS,
  selection_changed: 'selection-changed',
  insufficient_entries: 'insufficient',
  too_many_entries: 'too-many',
  too_much_text: 'too-much-text',
};

const SECTION: Record<InsightKind, 'themes' | 'patterns' | 'strengths' | 'concerns'> = { theme: 'themes', pattern: 'patterns', strength: 'strengths', concern: 'concerns' };

/**
 * Turns a stored AI review into the app's InsightReview. Sources point at the user's own
 * entries; dates come from the server's record of what was sent.
 */
export function toReview(stored: unknown): InsightReview | null {
  if (!isObject(stored) || !isObject(stored.output) || typeof stored.id !== 'string') return null;
  const o = stored.output;
  const dates = new Map<string, string>();
  if (Array.isArray(stored.sources)) for (const s of stored.sources) if (isObject(s) && typeof s.entry_id === 'string') dates.set(s.entry_id, String(s.written_at ?? ''));
  const refs = (ids: unknown): SourceRef[] => (Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && dates.has(id)).map((id) => ({ kind: 'entry', id, date: dates.get(id)! })) : []);

  const review: InsightReview = {
    period: stored.period === 'month' ? 'month' : 'week',
    entryCount: Number(stored.entry_count) || dates.size,
    themes: [],
    patterns: [],
    strengths: [],
    concerns: [],
    actions: [],
    basis: 'ai',
    summary: str(o.summary),
    enoughEvidence: o.enough_evidence === true,
    ai: { id: stored.id, provider: String(stored.provider), model: String(stored.model), createdAt: String(stored.created_at) },
  };
  (Array.isArray(o.observations) ? o.observations : []).forEach((ob, i) => {
    if (!isObject(ob)) return;
    const section = SECTION[ob.kind as InsightKind];
    const sources = refs(ob.entry_ids);
    if (!section || !str(ob.title) || !str(ob.body) || sources.length === 0) return;
    const insight: Insight = {
      id: `ai:${stored.id}:o${i}`,
      kind: ob.kind as InsightKind,
      title: String(ob.title),
      body: String(ob.body),
      sources,
      grounding: ob.grounding === 'observed' ? 'observed' : 'interpretation',
    };
    review[section].push(insight);
  });
  (Array.isArray(o.next_steps) ? o.next_steps : []).slice(0, 2).forEach((s, i) => {
    if (!isObject(s) || !str(s.text) || !str(s.why)) return;
    const sources = refs(s.entry_ids);
    if (sources.length === 0) return;
    const action: SuggestedAction = { id: `ai:${stored.id}:s${i}`, text: String(s.text), why: String(s.why), sources };
    review.actions.push(action);
  });
  return review;
}

export async function requestAiReview(invoke: Invoke, period: 'week' | 'month', entryIds: string[], key = newRequestKey()): Promise<AiReviewResult> {
  const res = await invoke('generate-insights', { period, entry_ids: entryIds, idempotency_key: key });
  if (res === 'offline') return { status: 'error', error: 'offline' };
  if (res.status === 200 && isObject(res.body)) {
    if (res.body.status === 'safety') return { status: 'safety' };
    const review = res.body.status === 'ready' ? toReview(res.body.insight) : null;
    return review ? { status: 'ready', review } : { status: 'error', error: 'invalid' };
  }
  const body = isObject(res.body) ? res.body : {};
  const limit = [body.max_entries, body.max_chars, body.needed].find((n) => typeof n === 'number') as number | undefined;
  return { status: 'error', error: REVIEW_ERRORS[errorOf(body) ?? ''] ?? 'failed', ...(limit !== undefined && { limit }) };
}

// Stored outputs ----------------------------------------------------------------------------

/**
 * The newest stored reflection per entry, as the app's Reflection. Rows come newest first.
 * The server keeps the entry's version (`entry_updated_at`), not its text, so `basedOn` is the
 * entry's current text only while that version is unchanged; otherwise it's left empty, which
 * shows the reflection as written for an earlier version of the entry.
 */
export function latestReflections(rows: unknown[]): Record<string, Reflection> {
  const out: Record<string, Reflection> = {};
  for (const row of rows) {
    if (!isObject(row) || typeof row.entry_id !== 'string' || out[row.entry_id]) continue;
    const entry = isObject(row.entries) ? row.entries : null;
    const current = entry && typeof entry.body === 'string' && new Date(String(row.entry_updated_at)).getTime() === new Date(String(entry.updated_at)).getTime();
    const reflection = toReflection(row, current ? String(entry.body) : '');
    if (reflection) out[row.entry_id] = reflection;
  }
  return out;
}

/** What the user can do with AI outputs already stored on their account. */
export interface AiOutputsRepo {
  /** The newest stored review for a period, or null. */
  latestReview(period: 'week' | 'month'): Promise<InsightReview | null>;
  /** The newest stored reflection per entry id. Throws a CloudError when it can't be read. */
  reflections(userId: string): Promise<Record<string, Reflection>>;
  deleteReflection(id: string): Promise<void>;
  /** The AI follow-up conversation about one entry. The entry is untouched. */
  deleteConversation(entryId: string): Promise<void>;
  /** Every AI reflection, review and follow-up conversation on the account. Entries are untouched. */
  deleteAll(): Promise<void>;
}

export function supabaseAiOutputs(client: SupabaseClient): AiOutputsRepo {
  return {
    async latestReview(period) {
      const { data, error } = await client
        .from('ai_insights')
        .select('id, created_at, period, entry_count, output, provider, model, ai_insight_sources(entry_id, entries(written_at))')
        .eq('period', period)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error('Could not load the review');
      if (!data) return null;
      const sources = ((data.ai_insight_sources ?? []) as unknown as { entry_id: string; entries: { written_at: string } | null }[]).map((s) => ({
        entry_id: s.entry_id,
        written_at: s.entries?.written_at ?? '',
      }));
      return toReview({ ...data, sources });
    },
    async reflections(userId) {
      try {
        const { data, error } = await client
          .from('ai_reflections')
          .select('id, entry_id, style, output, provider, model, created_at, entry_updated_at, entries(body, updated_at)')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });
        if (error) fail(error);
        return latestReflections(data ?? []);
      } catch (e) {
        if (e instanceof CloudError) throw e;
        throw new CloudError('Network unavailable', 'offline');
      }
    },
    async deleteReflection(id) {
      const { error } = await client.from('ai_reflections').delete().eq('id', id);
      if (error) throw new Error('Could not delete the reflection');
    },
    async deleteConversation(entryId) {
      const { error } = await client.from('ai_follow_ups').delete().eq('entry_id', entryId);
      if (error) throw new Error('Could not delete the conversation');
    },
    async deleteAll() {
      const { error } = await client.rpc('delete_ai_outputs');
      if (error) throw new Error('Could not delete AI outputs');
    },
  };
}
