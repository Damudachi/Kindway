import type { CompassValue, Entry, InsightFeedback, TomorrowStep } from '@/data/types';
import type { DemoState } from '@/state/demo-store';

/**
 * The parts of the journal that have a cloud copy, as rows keyed by their local id.
 * Rows are in database column shape minus `user_id`, so pushing is a plain upsert.
 *
 * Deliberately left out: simulated reflections and follow-up replies, saved memory, drafts,
 * reminders, and feedback on the fictional sample insights. Those stay on the device.
 */
export type ProfileRow = {
  onboarded: boolean;
  support_style: DemoState['supportStyle'];
  challenge_gently: boolean;
  challenge_level: DemoState['challengeLevel'];
  context_scope: DemoState['contextScope'];
  weekly_patterns: boolean;
  insights_use_compass: boolean;
  reflection_previews: DemoState['aiConsent'];
};
export type CompassRow = { id: string; area: string; note: string; ai_may_reference: boolean; position: number };
export type EntryRow = {
  id: string;
  written_at: string;
  title: string;
  body: string;
  feelings: string[];
  gratitude: string | null;
  revisit: boolean;
  exclude_from_analysis: boolean;
};
export type LinkRow = { entry_id: string; compass_id: string };
export type TomorrowRow = {
  id: string;
  text: string;
  saved_at: string;
  due_on: string;
  status: TomorrowStep['status'];
  done_at: string | null;
  outcome: TomorrowStep['outcome'] | null;
  source_kind: 'reflection' | 'insights' | null;
  source_entry_id: string | null;
};
export type FeedbackRow = { insight_id: string; feedback: InsightFeedback };

export type CloudSnapshot = {
  profile: ProfileRow | null;
  compass: Record<string, CompassRow>;
  entries: Record<string, EntryRow>;
  links: Record<string, LinkRow>;
  tomorrow: Record<string, TomorrowRow>;
  feedback: Record<string, FeedbackRow>;
};

export type Table = 'profiles' | 'compass_values' | 'entries' | 'entry_compass_links' | 'tomorrow_actions' | 'insight_feedback';
type Kind = Exclude<keyof CloudSnapshot, 'profile'>;

export const TABLES: Record<Kind, Table> = {
  compass: 'compass_values',
  entries: 'entries',
  links: 'entry_compass_links',
  tomorrow: 'tomorrow_actions',
  feedback: 'insight_feedback',
};

export const emptySnapshot = (): CloudSnapshot => ({ profile: null, compass: {}, entries: {}, links: {}, tomorrow: {}, feedback: {} });

export const linkKey = (l: LinkRow) => `${l.entry_id}|${l.compass_id}`;
/** The one Tomorrow step has no id of its own; when it was saved identifies it. */
export const stepId = (s: TomorrowStep) => `t-${new Date(s.savedOn).getTime()}`;
const iso = (s: string) => new Date(s).toISOString();
const isSampleInsight = (id: string) => id.startsWith('sample:');

// State -> rows ----------------------------------------------------------------------------

export function toCloud(state: DemoState): CloudSnapshot {
  const snap = emptySnapshot();
  snap.profile = {
    onboarded: state.onboarded,
    support_style: state.supportStyle,
    challenge_gently: state.challengeGently,
    challenge_level: state.challengeLevel,
    context_scope: state.contextScope,
    weekly_patterns: state.weeklyPatterns,
    insights_use_compass: state.insightsUseCompass,
    reflection_previews: state.aiConsent,
  };
  const compassIds = new Set<string>();
  state.compass.slice(0, 3).forEach((c, position) => {
    compassIds.add(c.id);
    snap.compass[c.id] = { id: c.id, area: c.area, note: c.note, ai_may_reference: c.aiMayReference, position };
  });
  for (const e of state.entries) {
    if (e.sample || !e.body.trim()) continue;
    snap.entries[e.id] = {
      id: e.id,
      written_at: iso(e.date),
      title: e.title,
      body: e.body,
      feelings: e.feelings,
      gratitude: e.gratitude ?? null,
      revisit: !!e.revisit,
      exclude_from_analysis: !!e.excludeFromAnalysis,
    };
    for (const compass_id of new Set(e.compassIds ?? [])) {
      if (!compassIds.has(compass_id)) continue;
      const link = { entry_id: e.id, compass_id };
      snap.links[linkKey(link)] = link;
    }
  }
  const t = state.tomorrow;
  if (t && t.text.trim()) {
    const entryId = t.source?.kind === 'reflection' && snap.entries[t.source.entryId] ? t.source.entryId : null;
    const id = stepId(t);
    snap.tomorrow[id] = {
      id,
      text: t.text,
      saved_at: iso(t.savedOn),
      due_on: iso(t.dueOn),
      status: t.status,
      done_at: t.doneOn ? iso(t.doneOn) : null,
      outcome: t.outcome ?? null,
      source_kind: t.source?.kind ?? null,
      source_entry_id: entryId,
    };
  }
  for (const [insight_id, feedback] of Object.entries(state.insightFeedback)) {
    if (!isSampleInsight(insight_id)) snap.feedback[insight_id] = { insight_id, feedback };
  }
  return snap;
}

/** Puts rows read from the database into the same shape `toCloud` produces, so they compare equal. */
export function normalizeRows(rows: {
  profile: (ProfileRow & Record<string, unknown>) | null;
  compass: (CompassRow & Record<string, unknown>)[];
  entries: (EntryRow & Record<string, unknown>)[];
  links: (LinkRow & Record<string, unknown>)[];
  tomorrow: (TomorrowRow & Record<string, unknown>)[];
  feedback: (FeedbackRow & Record<string, unknown>)[];
}): CloudSnapshot {
  const snap = emptySnapshot();
  const p = rows.profile;
  snap.profile = p
    ? {
        onboarded: p.onboarded,
        support_style: p.support_style,
        challenge_gently: p.challenge_gently,
        challenge_level: p.challenge_level,
        context_scope: p.context_scope,
        weekly_patterns: p.weekly_patterns,
        insights_use_compass: p.insights_use_compass,
        reflection_previews: p.reflection_previews,
      }
    : null;
  for (const c of rows.compass) snap.compass[c.id] = { id: c.id, area: c.area, note: c.note, ai_may_reference: c.ai_may_reference, position: c.position };
  for (const e of rows.entries)
    snap.entries[e.id] = {
      id: e.id,
      written_at: iso(e.written_at),
      title: e.title,
      body: e.body,
      feelings: e.feelings ?? [],
      gratitude: e.gratitude ?? null,
      revisit: e.revisit,
      exclude_from_analysis: e.exclude_from_analysis,
    };
  for (const l of rows.links) snap.links[linkKey(l)] = { entry_id: l.entry_id, compass_id: l.compass_id };
  for (const t of rows.tomorrow)
    snap.tomorrow[t.id] = {
      id: t.id,
      text: t.text,
      saved_at: iso(t.saved_at),
      due_on: iso(t.due_on),
      status: t.status,
      done_at: t.done_at ? iso(t.done_at) : null,
      outcome: t.outcome ?? null,
      source_kind: t.source_kind ?? null,
      source_entry_id: t.source_entry_id ?? null,
    };
  for (const f of rows.feedback) snap.feedback[f.insight_id] = { insight_id: f.insight_id, feedback: f.feedback };
  return snap;
}

// Diffing ----------------------------------------------------------------------------------

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export type Changes = {
  profile: ProfileRow | null;
  upserts: { [K in Kind]: CloudSnapshot[K][string][] };
  deletes: { [K in Kind]: string[] };
};

/** What must be written so the cloud matches `next`, given it currently matches `base`. */
export function diff(base: CloudSnapshot, next: CloudSnapshot): Changes {
  const kinds = Object.keys(TABLES) as Kind[];
  const changes: Changes = {
    profile: next.profile && !same(base.profile, next.profile) ? next.profile : null,
    upserts: { compass: [], entries: [], links: [], tomorrow: [], feedback: [] },
    deletes: { compass: [], entries: [], links: [], tomorrow: [], feedback: [] },
  };
  for (const kind of kinds) {
    const b = base[kind] as Record<string, unknown>;
    const n = next[kind] as Record<string, unknown>;
    for (const [key, row] of Object.entries(n)) if (!same(b[key], row)) (changes.upserts[kind] as unknown[]).push(row);
    for (const key of Object.keys(b)) if (!(key in n)) changes.deletes[kind].push(key);
  }
  return changes;
}

export const changeCount = (c: Changes) =>
  (c.profile ? 1 : 0) +
  Object.values(c.upserts).reduce((n, rows) => n + rows.length, 0) +
  Object.values(c.deletes).reduce((n, keys) => n + keys.length, 0);

/**
 * Three-way merge per record: anything the device changed since the last sync (`base`) wins,
 * everything else follows the cloud, including records deleted on another device.
 */
export function mergeSnapshots(base: CloudSnapshot, local: CloudSnapshot, remote: CloudSnapshot): CloudSnapshot {
  const out = emptySnapshot();
  out.profile = !same(base.profile, local.profile) ? local.profile : (remote.profile ?? local.profile);
  for (const kind of Object.keys(TABLES) as Kind[]) {
    const b = base[kind] as Record<string, unknown>;
    const l = local[kind] as Record<string, unknown>;
    const r = remote[kind] as Record<string, unknown>;
    const merged = out[kind] as Record<string, unknown>;
    for (const key of new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)])) {
      const changedHere = !same(b[key], l[key]);
      const value = changedHere ? l[key] : r[key];
      if (value !== undefined) merged[key] = value;
    }
  }
  // A link or step can't point at an entry or compass value the merge dropped.
  for (const [key, link] of Object.entries(out.links)) if (!out.entries[link.entry_id] || !out.compass[link.compass_id]) delete out.links[key];
  for (const t of Object.values(out.tomorrow)) if (t.source_entry_id && !out.entries[t.source_entry_id]) t.source_entry_id = null;
  return out;
}

// Rows -> state ----------------------------------------------------------------------------

/**
 * Applies a cloud snapshot to the device state. Device-only parts (simulated reflections,
 * conversations, memory, reminders, draft, sample feedback) are kept for entries that remain;
 * conversations and links of entries that are gone are removed, as when deleting on the device.
 */
export function applyCloud(state: DemoState, snap: CloudSnapshot): DemoState {
  const byId = new Map(state.entries.map((e) => [e.id, e]));
  const compass: CompassValue[] = Object.values(snap.compass)
    .sort((a, b) => a.position - b.position)
    .map((c) => ({ id: c.id, area: c.area, note: c.note, aiMayReference: c.ai_may_reference }));
  const linksByEntry = new Map<string, string[]>();
  for (const l of Object.values(snap.links)) linksByEntry.set(l.entry_id, [...(linksByEntry.get(l.entry_id) ?? []), l.compass_id]);
  const order = compass.map((c) => c.id);

  const entries: Entry[] = Object.values(snap.entries).map((row) => {
    const prev = byId.get(row.id);
    const links = (linksByEntry.get(row.id) ?? []).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return {
      ...prev,
      id: row.id,
      date: row.written_at,
      title: row.title,
      body: row.body,
      feelings: row.feelings,
      gratitude: row.gratitude ?? undefined,
      revisit: row.revisit || undefined,
      excludeFromAnalysis: row.exclude_from_analysis || undefined,
      compassIds: links,
      reflectionStatus: prev?.reflectionStatus ?? 'none',
      sample: false,
    };
  });
  const kept = new Set(entries.map((e) => e.id));
  // Other reflections stop pointing at removed entries.
  for (const e of entries)
    if (e.reflection?.related?.some((r) => !kept.has(r))) e.reflection = { ...e.reflection, related: e.reflection.related.filter((r) => kept.has(r)) };

  const chats = Object.fromEntries(Object.entries(state.chats).filter(([id]) => kept.has(id)));
  const sampleFeedback = Object.entries(state.insightFeedback).filter(([id]) => isSampleInsight(id));
  const insightFeedback = Object.fromEntries([...sampleFeedback, ...Object.values(snap.feedback).map((f) => [f.insight_id, f.feedback] as const)]);

  const steps = Object.values(snap.tomorrow).sort((a, b) => b.saved_at.localeCompare(a.saved_at));
  const t = steps[0];
  const tomorrow: TomorrowStep | null = t
    ? {
        text: t.text,
        savedOn: t.saved_at,
        dueOn: t.due_on,
        status: t.status,
        doneOn: t.done_at ?? undefined,
        outcome: t.outcome ?? undefined,
        source:
          t.source_kind === 'insights'
            ? { kind: 'insights' }
            : t.source_kind === 'reflection' && t.source_entry_id && kept.has(t.source_entry_id)
              ? { kind: 'reflection', entryId: t.source_entry_id }
              : undefined,
      }
    : null;

  const p = snap.profile;
  return {
    ...state,
    ...(p && {
      onboarded: p.onboarded || state.onboarded,
      supportStyle: p.support_style,
      challengeGently: p.challenge_gently,
      challengeLevel: p.challenge_level,
      contextScope: p.context_scope,
      weeklyPatterns: p.weekly_patterns,
      insightsUseCompass: p.insights_use_compass,
      aiConsent: p.reflection_previews,
    }),
    compass,
    entries,
    chats,
    insightFeedback,
    tomorrow,
    draft: state.draft.editingId && !kept.has(state.draft.editingId) ? { ...state.draft, editingId: undefined } : state.draft,
  };
}

export function counts(snap: CloudSnapshot) {
  return {
    entries: Object.keys(snap.entries).length,
    compass: Object.keys(snap.compass).length,
    actions: Object.keys(snap.tomorrow).length,
  };
}
