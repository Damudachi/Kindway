import { applyCloud, counts, diff, linkKey, toCloud, type CloudSnapshot } from '@/services/cloud/records';
import { CloudError, type CloudRepo } from '@/services/cloud/repo';
import { emptyDraft, type DemoState } from '@/state/demo-store';

/**
 * Moving the local-only journal into an account, the first time cloud sync is turned on.
 * Planning is pure, so the user sees exactly what will be uploaded before anything is sent.
 * Nothing on either side is overwritten: same-id entries with different text are added as
 * copies, and a compass that wouldn't fit in three areas blocks the merge instead.
 */
export type MigrationPlan = {
  local: ReturnType<typeof counts>;
  cloud: ReturnType<typeof counts>;
  /** What the account will gain from this device. */
  adding: ReturnType<typeof counts>;
  /** Entries whose id already exists in the account with different text; uploaded as copies. */
  copies: Record<string, string>;
  /** Compass areas from this device that don't fit next to the account's. */
  compassOverflow: string[];
  /** The account keeps its own preferences and small step. */
  keepsAccountPreferences: boolean;
  keepsAccountStep: boolean;
  /** The account as it will be after the upload. */
  result: CloudSnapshot;
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export const isEmpty = (s: CloudSnapshot) =>
  !s.profile && [s.compass, s.entries, s.links, s.tomorrow, s.feedback].every((rows) => Object.keys(rows).length === 0);

export function planMigration(localState: DemoState, cloud: CloudSnapshot): MigrationPlan {
  const local = toCloud(localState);
  const result: CloudSnapshot = structuredClone(cloud);
  const copies: Record<string, string> = {};
  const adding = { entries: 0, compass: 0, actions: 0 };

  for (const [id, row] of Object.entries(local.compass)) {
    if (result.compass[id]) continue;
    result.compass[id] = { ...row, position: Object.keys(result.compass).length };
    adding.compass++;
  }
  const compassOverflow = Object.values(result.compass)
    .slice(3)
    .map((c) => c.area);

  for (const [id, row] of Object.entries(local.entries)) {
    const existing = result.entries[id];
    if (existing && same(existing, row)) continue;
    let target = id;
    if (existing) {
      let n = 1;
      while (result.entries[`${id}-d${n}`] || local.entries[`${id}-d${n}`]) n++;
      target = `${id}-d${n}`;
      copies[id] = target;
    }
    result.entries[target] = { ...row, id: target };
    adding.entries++;
  }
  const mapped = (id: string) => copies[id] ?? id;
  for (const link of Object.values(local.links)) {
    const l = { entry_id: mapped(link.entry_id), compass_id: link.compass_id };
    result.links[linkKey(l)] = l;
  }

  const keepsAccountStep = Object.keys(cloud.tomorrow).length > 0;
  if (!keepsAccountStep)
    for (const t of Object.values(local.tomorrow)) {
      result.tomorrow[t.id] = { ...t, source_entry_id: t.source_entry_id ? mapped(t.source_entry_id) : null };
      adding.actions++;
    }
  for (const f of Object.values(local.feedback)) if (!result.feedback[f.insight_id]) result.feedback[f.insight_id] = f;

  const keepsAccountPreferences = !!cloud.profile;
  result.profile = cloud.profile
    ? { ...cloud.profile, onboarded: cloud.profile.onboarded || localState.onboarded }
    : local.profile;

  return { local: counts(local), cloud: counts(cloud), adding, copies, compassOverflow, keepsAccountPreferences, keepsAccountStep, result };
}

/** Gives copied entries their new ids on the device too, so their conversations follow them. */
export function applyCopies(state: DemoState, copies: Record<string, string>): DemoState {
  if (Object.keys(copies).length === 0) return state;
  const id = (x: string) => copies[x] ?? x;
  const t = state.tomorrow;
  return {
    ...state,
    entries: state.entries.map((e) => ({ ...e, id: id(e.id) })),
    chats: Object.fromEntries(Object.entries(state.chats).map(([k, v]) => [id(k), v])),
    tomorrow: t?.source?.kind === 'reflection' ? { ...t, source: { kind: 'reflection', entryId: id(t.source.entryId) } } : t,
  };
}

/** The account's journal on this device once the upload is verified. */
export function accountStateAfter(local: DemoState, plan: MigrationPlan, cloud: CloudSnapshot): DemoState {
  return applyCloud({ ...applyCopies(local, plan.copies), draft: emptyDraft }, cloud);
}

/**
 * Uploads the plan's result and reads the account back to check every record arrived intact.
 * Safe to call again after a failure: all writes are upserts by id.
 */
export async function runMigration(repo: CloudRepo, userId: string, plan: MigrationPlan, cloudNow: CloudSnapshot): Promise<CloudSnapshot> {
  if (plan.compassOverflow.length > 0) throw new CloudError('Compass would exceed three areas', 'rejected');
  // Only add or change records; never delete what the account already has.
  const changes = diff(cloudNow, plan.result);
  for (const k of Object.keys(changes.deletes) as (keyof typeof changes.deletes)[]) changes.deletes[k] = [];
  await repo.push(userId, changes);
  await repo.markConsented(userId);
  const after = await repo.pull(userId);
  verify(plan.result, after);
  return after;
}

export class VerificationError extends Error {}

function verify(expected: CloudSnapshot, actual: CloudSnapshot) {
  const kinds = ['compass', 'entries', 'links', 'tomorrow', 'feedback'] as const;
  for (const kind of kinds) {
    const want = expected[kind] as Record<string, unknown>;
    const got = actual[kind] as Record<string, unknown>;
    for (const key of Object.keys(want)) if (!same(want[key], got[key])) throw new VerificationError(`Missing or different ${kind} record after upload`);
  }
  if (!actual.profile) throw new VerificationError('Missing profile after upload');
}
