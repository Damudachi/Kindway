// What the AI functions read and write. Reads run as the signed-in caller (their JWT), so Row
// Level Security decides what exists. Writes (the request ledger and AI rows) go through the
// server key with the user id from the verified token: signed-in callers can't write AI rows
// themselves, so "Written by AI" only ever comes from here.
import { type AiScope, hasActiveConsent, type RpcClient } from './ai-consent.ts';

export type RequestKind = 'reflection' | 'insights' | 'follow_up';

export type BeginResult =
  | { outcome: 'started'; requestId: string }
  | { outcome: 'duplicate'; requestId: string; status: 'pending' | 'succeeded' | 'failed' }
  | { outcome: 'busy' }
  | { outcome: 'rate'; retryAfter: number };

export type EntryRow = {
  id: string;
  written_at: string;
  body_updated_at: string;
  body: string;
  feelings: string[];
  gratitude: string | null;
  revisit: boolean;
  exclude_from_analysis: boolean;
};

export type ProfileRow = {
  context_scope: 'relevant' | 'current';
  challenge_gently: boolean;
  challenge_level: 'gentle' | 'balanced' | 'direct';
  insights_use_compass: boolean;
};

/** A compass value linked to an entry, that the user allowed AI to reference. */
export type CompassLink = { entry_id: string; area: string; note: string };

export type StoredReflection = { id: string; entry_id: string; created_at: string; style: string; output: unknown; provider: string; model: string };
export type StoredInsight = {
  id: string;
  created_at: string;
  period: string;
  range_start: string;
  range_end: string;
  entry_count: number;
  output: unknown;
  provider: string;
  model: string;
  sources: { entry_id: string; written_at: string }[];
};

/** One completed follow-up exchange: the user's message and the validated reply. */
export type StoredFollowUp = { id: string; entry_id: string; created_at: string; style: string; message: string; output: unknown; provider: string; model: string };
export type NewFollowUp = Omit<StoredFollowUp, 'id' | 'created_at'> & { request_id: string; schema_version: string; prompt_version: string };

export type NewReflection = Omit<StoredReflection, 'id' | 'created_at'> & { request_id: string; schema_version: string; prompt_version: string; entry_updated_at: string };
export type NewInsight = Omit<StoredInsight, 'id' | 'created_at' | 'sources'> & { request_id: string; schema_version: string; prompt_version: string };

export interface AiStore {
  consentActive(scope: AiScope): Promise<boolean>;
  beginRequest(kind: RequestKind, key: string, limits: { cooldownSeconds: number; dailyLimit: number }): Promise<BeginResult>;
  finishRequest(requestId: string, status: 'succeeded' | 'failed', code?: string): Promise<void>;
  entries(ids: string[]): Promise<EntryRow[]>;
  profile(): Promise<ProfileRow | null>;
  compassLinks(entryIds: string[]): Promise<CompassLink[]>;
  reflectionForRequest(requestId: string): Promise<StoredReflection | null>;
  insightForRequest(requestId: string): Promise<StoredInsight | null>;
  saveReflection(row: NewReflection): Promise<StoredReflection>;
  saveInsight(row: NewInsight, entries: { id: string; written_at: string }[]): Promise<StoredInsight>;
  /** Stored reflections by id (only the caller's exist). */
  findReflections(ids: string[]): Promise<StoredReflection[]>;
  /** Stored follow-up exchanges by id (only the caller's exist). */
  followUps(ids: string[]): Promise<StoredFollowUp[]>;
  followUpForRequest(requestId: string): Promise<StoredFollowUp | null>;
  saveFollowUp(row: NewFollowUp): Promise<StoredFollowUp>;
}

/** Thrown for any database failure. Carries no message from the database. */
export class StoreError extends Error {
  constructor() {
    super('store_error');
  }
}

// deno-lint-ignore no-explicit-any
type Client = RpcClient & { from(table: string): any };

const ENTRY_COLUMNS = 'id, written_at, body_updated_at, body, feelings, gratitude, revisit, exclude_from_analysis';
const REFLECTION_COLUMNS = 'id, entry_id, created_at, style, output, provider, model';
const FOLLOW_UP_COLUMNS = 'id, entry_id, created_at, style, message, output, provider, model';
const INSIGHT_COLUMNS = 'id, created_at, period, range_start, range_end, entry_count, output, provider, model';

/**
 * The AiStore for one verified caller. `caller` is a client with the caller's Authorization header;
 * `server` uses the server key; `userId` comes only from the verified token.
 */
export function supabaseAiStore(caller: Client, server: Client, userId: string): AiStore {
  const rows = async <T>(query: PromiseLike<{ data: T | null; error: unknown }>) => {
    const { data, error } = await query;
    if (error) throw new StoreError();
    return data;
  };
  const sourcesFor = async (insightId: string) => {
    const links = (await rows<{ entry_id: string; entries: { written_at: string } | null }[]>(
      caller.from('ai_insight_sources').select('entry_id, entries(written_at)').eq('insight_id', insightId),
    )) ?? [];
    return links.map((l) => ({ entry_id: l.entry_id, written_at: l.entries?.written_at ?? '' }));
  };

  return {
    consentActive: (scope) => hasActiveConsent(caller, scope),

    async beginRequest(kind, key, limits) {
      const { data, error } = await server.rpc('ai_server_begin_request', {
        p_user: userId,
        p_kind: kind,
        p_key: key,
        p_cooldown_seconds: limits.cooldownSeconds,
        p_daily_limit: limits.dailyLimit,
      });
      if (error || !data || typeof data !== 'object') throw new StoreError();
      const d = data as Record<string, unknown>;
      if (d.outcome === 'started') return { outcome: 'started', requestId: String(d.request_id) };
      if (d.outcome === 'duplicate') return { outcome: 'duplicate', requestId: String(d.request_id), status: d.status as 'pending' };
      if (d.outcome === 'busy') return { outcome: 'busy' };
      if (d.outcome === 'rate') return { outcome: 'rate', retryAfter: Number(d.retry_after) || 60 };
      throw new StoreError();
    },

    async finishRequest(requestId, status, code) {
      const { error } = await server.rpc('ai_server_finish_request', { p_user: userId, p_request_id: requestId, p_status: status, p_error_code: code ?? null });
      if (error) throw new StoreError();
    },

    async entries(ids) {
      if (ids.length === 0) return [];
      return (await rows<EntryRow[]>(caller.from('entries').select(ENTRY_COLUMNS).in('id', ids))) ?? [];
    },

    async profile() {
      return rows<ProfileRow>(caller.from('profiles').select('context_scope, challenge_gently, challenge_level, insights_use_compass').maybeSingle());
    },

    async compassLinks(entryIds) {
      if (entryIds.length === 0) return [];
      const links = (await rows<{ entry_id: string; compass_values: { area: string; note: string; ai_may_reference: boolean } | null }[]>(
        caller.from('entry_compass_links').select('entry_id, compass_values(area, note, ai_may_reference)').in('entry_id', entryIds),
      )) ?? [];
      return links.flatMap((l) => (l.compass_values?.ai_may_reference ? [{ entry_id: l.entry_id, area: l.compass_values.area, note: l.compass_values.note }] : []));
    },

    reflectionForRequest: (requestId) => rows<StoredReflection>(caller.from('ai_reflections').select(REFLECTION_COLUMNS).eq('request_id', requestId).maybeSingle()),

    async insightForRequest(requestId) {
      const insight = await rows<Omit<StoredInsight, 'sources'>>(caller.from('ai_insights').select(INSIGHT_COLUMNS).eq('request_id', requestId).maybeSingle());
      return insight ? { ...insight, sources: await sourcesFor(insight.id) } : null;
    },

    async saveReflection(row) {
      const saved = await rows<StoredReflection>(server.from('ai_reflections').insert({ ...row, user_id: userId }).select(REFLECTION_COLUMNS).single());
      if (!saved) throw new StoreError();
      return saved;
    },

    async saveInsight(row, entries) {
      const saved = await rows<Omit<StoredInsight, 'sources'>>(server.from('ai_insights').insert({ ...row, user_id: userId }).select(INSIGHT_COLUMNS).single());
      if (!saved) throw new StoreError();
      const { error } = await server.from('ai_insight_sources').insert(entries.map((e) => ({ insight_id: saved.id, entry_id: e.id, user_id: userId })));
      if (error) {
        // A review must never exist without its sources; remove it rather than keep it half-saved.
        await server.from('ai_insights').delete().eq('id', saved.id);
        throw new StoreError();
      }
      return { ...saved, sources: entries.map((e) => ({ entry_id: e.id, written_at: e.written_at })) };
    },

    async findReflections(ids) {
      if (ids.length === 0) return [];
      return (await rows<StoredReflection[]>(caller.from('ai_reflections').select(REFLECTION_COLUMNS).in('id', ids))) ?? [];
    },

    async followUps(ids) {
      if (ids.length === 0) return [];
      return (await rows<StoredFollowUp[]>(caller.from('ai_follow_ups').select(FOLLOW_UP_COLUMNS).in('id', ids).order('created_at', { ascending: true }))) ?? [];
    },

    followUpForRequest: (requestId) => rows<StoredFollowUp>(caller.from('ai_follow_ups').select(FOLLOW_UP_COLUMNS).eq('request_id', requestId).maybeSingle()),

    async saveFollowUp(row) {
      const saved = await rows<StoredFollowUp>(server.from('ai_follow_ups').insert({ ...row, user_id: userId }).select(FOLLOW_UP_COLUMNS).single());
      if (!saved) throw new StoreError();
      return saved;
    },
  };
}
