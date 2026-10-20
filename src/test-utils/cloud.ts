import { emptySnapshot, linkKey, type Changes, type CloudSnapshot } from '@/services/cloud/records';
import { CloudError, type CloudRepo } from '@/services/cloud/repo';

/**
 * An in-memory cloud with one isolated store per user, mirroring the database's rules that
 * matter to the client: per-user rows, upsert by id, cascades from entries to links.
 */
export function fakeCloud() {
  const users = new Map<string, CloudSnapshot>();
  const consented = new Set<string>();
  const log: { userId: string; changes: Changes }[] = [];
  let failNext: { kind: CloudError['kind']; afterWrites?: number } | null = null;

  const data = (userId: string) => {
    if (!users.has(userId)) users.set(userId, emptySnapshot());
    return users.get(userId)!;
  };

  const repo: CloudRepo = {
    async pull(userId) {
      if (failNext && failNext.afterWrites === undefined) {
        const f = failNext;
        failNext = null;
        throw new CloudError('fail', f.kind);
      }
      return structuredClone(data(userId));
    },
    async push(userId, changes) {
      log.push({ userId, changes: structuredClone(changes) });
      const d = data(userId);
      let writes = 0;
      const step = () => {
        if (failNext && (failNext.afterWrites === undefined || writes >= failNext.afterWrites)) {
          const f = failNext;
          failNext = null;
          throw new CloudError('fail', f.kind);
        }
        writes++;
      };
      for (const key of changes.deletes.links) {
        step();
        delete d.links[key];
      }
      for (const key of changes.deletes.feedback) {
        step();
        delete d.feedback[key];
      }
      for (const key of changes.deletes.tomorrow) {
        step();
        delete d.tomorrow[key];
      }
      for (const key of changes.deletes.entries) {
        step();
        delete d.entries[key];
        for (const [k, l] of Object.entries(d.links)) if (l.entry_id === key) delete d.links[k];
        for (const t of Object.values(d.tomorrow)) if (t.source_entry_id === key) t.source_entry_id = null;
      }
      for (const key of changes.deletes.compass) {
        step();
        delete d.compass[key];
        for (const [k, l] of Object.entries(d.links)) if (l.compass_id === key) delete d.links[k];
      }
      if (changes.profile) {
        step();
        d.profile = structuredClone(changes.profile);
      }
      for (const kind of ['compass', 'entries', 'links', 'tomorrow', 'feedback'] as const) {
        for (const row of changes.upserts[kind]) {
          step();
          const key = kind === 'links' ? linkKey(row as never) : kind === 'feedback' ? (row as { insight_id: string }).insight_id : (row as { id: string }).id;
          (d[kind] as Record<string, unknown>)[key] = structuredClone(row);
        }
      }
    },
    async markConsented(userId) {
      consented.add(userId);
    },
  };

  return {
    repo,
    users,
    consented,
    log,
    data,
    /** The next call fails; for pushes, optionally after some writes already landed. */
    failNext(kind: CloudError['kind'] = 'offline', afterWrites?: number) {
      failNext = { kind, afterWrites };
    },
  };
}
