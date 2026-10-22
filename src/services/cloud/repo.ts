import type { SupabaseClient } from '@supabase/supabase-js';

import { normalizeRows, TABLES, type Changes, type CloudSnapshot } from '@/services/cloud/records';

/**
 * The cloud side of the journal, for one signed-in user. Screens never call this directly;
 * the sync layer does. Every write is an idempotent upsert or delete by (user_id, id), so a
 * retry after a partial failure can't duplicate anything.
 */
export interface CloudRepo {
  pull(userId: string): Promise<CloudSnapshot>;
  push(userId: string, changes: Changes): Promise<void>;
  /** Records that the user chose to keep a cloud copy, once. */
  markConsented(userId: string): Promise<void>;
}

export class CloudError extends Error {
  constructor(
    message: string,
    readonly kind: 'offline' | 'auth' | 'rejected' | 'unknown',
    /** The server's error code (e.g. `42501`, `PGRST301`), safe to show; never a message. */
    readonly code?: string,
  ) {
    super(message);
  }
}

const safeCode = (code: unknown) => (typeof code === 'string' && /^[A-Z0-9_]{1,20}$/i.test(code) ? code : undefined);

/** What a thrown, non-server error means: a failed fetch is offline; anything else is a bug, not a connection. */
export function unexpected(e: unknown): CloudError {
  if (e instanceof CloudError) return e;
  if (e instanceof TypeError && /fetch|network/i.test(e.message)) return new CloudError('Network unavailable', 'offline');
  return new CloudError('Cloud data could not be read', 'unknown', e instanceof Error && /^\w{1,40}$/.test(e.name) ? e.name : 'unexpected');
}

const KEYS: Record<keyof typeof TABLES, string> = {
  compass: 'id',
  entries: 'id',
  links: 'entry_id,compass_id',
  tomorrow: 'id',
  feedback: 'insight_id',
};

export function fail(error: { message?: string; code?: string; status?: number } | null): never {
  const msg = error?.message ?? '';
  // Only the category leaves this function; messages may echo row content.
  if (/fetch|network|timed? ?out/i.test(msg)) throw new CloudError('Network unavailable', 'offline');
  const code = safeCode(error?.code) ?? (error?.status ? `http_${error.status}` : undefined);
  if (error?.code === 'PGRST301' || error?.code === '42501' || error?.status === 401) throw new CloudError('Not authorized', 'auth', code);
  if (error?.code?.startsWith('23')) throw new CloudError('Rejected by the server', 'rejected', code);
  throw new CloudError('Cloud request failed', 'unknown', code);
}

export function supabaseRepo(client: SupabaseClient): CloudRepo {
  const select = async (table: string, userId: string) => {
    const { data, error } = await client.from(table).select('*').eq('user_id', userId);
    if (error) fail(error);
    return data ?? [];
  };

  const remove = async (table: string, userId: string, keyCols: string, keys: string[]) => {
    if (keys.length === 0) return;
    if (keyCols === 'entry_id,compass_id') {
      for (const key of keys) {
        const [entry_id, compass_id] = key.split('|');
        const { error } = await client.from(table).delete().eq('user_id', userId).eq('entry_id', entry_id).eq('compass_id', compass_id);
        if (error) fail(error);
      }
      return;
    }
    const { error } = await client.from(table).delete().eq('user_id', userId).in(keyCols, keys);
    if (error) fail(error);
  };

  const upsert = async (table: string, userId: string, keyCols: string, rows: object[]) => {
    if (rows.length === 0) return;
    const { error } = await client.from(table).upsert(rows.map((r) => ({ ...r, user_id: userId })), { onConflict: keyCols ? `user_id,${keyCols}` : 'user_id' });
    if (error) fail(error);
  };

  return {
    async pull(userId) {
      try {
        const [profiles, compass, entries, links, tomorrow, feedback] = await Promise.all([
          select('profiles', userId),
          select('compass_values', userId),
          select('entries', userId),
          select('entry_compass_links', userId),
          select('tomorrow_actions', userId),
          select('insight_feedback', userId),
        ]);
        return normalizeRows({ profile: profiles[0] ?? null, compass, entries, links, tomorrow, feedback });
      } catch (e) {
        throw unexpected(e);
      }
    },

    async push(userId, c) {
      try {
        // Children first when deleting, parents first when writing, so foreign keys always hold.
        await remove('entry_compass_links', userId, KEYS.links, c.deletes.links);
        await remove('insight_feedback', userId, KEYS.feedback, c.deletes.feedback);
        await remove('tomorrow_actions', userId, KEYS.tomorrow, c.deletes.tomorrow);
        await remove('entries', userId, KEYS.entries, c.deletes.entries);
        await remove('compass_values', userId, KEYS.compass, c.deletes.compass);
        if (c.profile) await upsert('profiles', userId, '', [c.profile]);
        await upsert('compass_values', userId, KEYS.compass, c.upserts.compass);
        await upsert('entries', userId, KEYS.entries, c.upserts.entries);
        await upsert('entry_compass_links', userId, KEYS.links, c.upserts.links);
        await upsert('tomorrow_actions', userId, KEYS.tomorrow, c.upserts.tomorrow);
        await upsert('insight_feedback', userId, KEYS.feedback, c.upserts.feedback);
      } catch (e) {
        throw unexpected(e);
      }
    },

    async markConsented(userId) {
      const { error } = await client
        .from('profiles')
        .update({ cloud_sync_consented_at: new Date().toISOString() })
        .eq('user_id', userId)
        .is('cloud_sync_consented_at', null);
      if (error) fail(error);
    },
  };
}
