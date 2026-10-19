import { shortDate } from '@/data/dates';

import { THEME_RULES, matchesRule, type ThemeRule } from './mock-themes';
import type { EntryContext, Insight, SuggestedAction, WeeklyRequest, WeeklyResult } from './types';

/** Fewer entries than this and the mock says so instead of guessing. */
export const MIN_ENTRIES = 3;
/** A theme or pattern needs at least this many entries behind it. */
const MIN_REPEAT = 2;

/** Phrases that suggest the writer was still turning something over. */
const OPEN_MARKERS = ['keep thinking', 'still', "don't know", 'don’t know', 'not sure', "can't stop", 'can’t stop', 'wonder if', 'what if'];

/**
 * Simulated weekly review. Every insight is computed from the entries in the request and
 * cites them; when the evidence isn't there, the section stays empty rather than filled in.
 */
export function mockWeeklyReview(req: WeeklyRequest): WeeklyResult {
  const entries = [...req.entries].sort((a, b) => a.date.localeCompare(b.date));
  if (entries.length === 0) return { status: 'empty' };
  if (entries.length < MIN_ENTRIES) return { status: 'insufficient', entryCount: entries.length, needed: MIN_ENTRIES };

  const skip = new Set(req.excludeIds);
  const keep = <T extends { id: string }>(x: T) => !skip.has(x.id);
  const compassFor = (rule: ThemeRule) => req.compass.find((c) => c.aiMayReference && rule.areas.includes(c.area))?.area;
  const matched = THEME_RULES.map((rule) => ({ rule, hits: entries.filter((e) => matchesRule(rule, e)) }));
  const recurring = matched.filter((m) => m.rule.kind !== 'strength' && m.hits.length >= MIN_REPEAT);

  const themes: Insight[] = recurring.map(({ rule, hits }) => ({
    id: `theme:${rule.id}`,
    kind: 'theme',
    title: rule.title,
    body: `Came up in ${hits.length} of your ${entries.length} entries this week.`,
    evidence: hits.map((e) => e.id),
  }));

  const patterns: Insight[] = recurring.flatMap(({ rule, hits }) => {
    const feeling = commonFeeling(hits, rule.feelings ?? []);
    if (!feeling) return [];
    return [
      {
        id: `pattern:${rule.id}:${feeling.name}`,
        kind: 'pattern' as const,
        title: `When ${rule.label} came up, you often felt ${feeling.name.toLowerCase()}`,
        body: 'A possible link, not a rule. You may know reasons it doesn’t fit.',
        evidence: feeling.ids,
      },
    ];
  });

  const strengths: Insight[] = matched
    .filter((m) => m.rule.kind === 'strength' && m.hits.length > 0)
    .map(({ rule, hits }) => ({
      id: `strength:${rule.id}`,
      kind: 'strength',
      title: rule.title,
      body: hits.length > 1 ? `In ${hits.length} entries this week, in your own words.` : `You wrote about this on ${shortDate(hits[0].date)}.`,
      evidence: hits.map((e) => e.id),
      compassValue: compassFor(rule),
    }));

  const concerns: Insight[] = [...entries]
    .reverse()
    .flatMap((e) => {
      const sentence = openSentence(e.body);
      return sentence
        ? [{ id: `concern:${e.id}`, kind: 'concern' as const, title: `“${sentence}”`, body: `From ${shortDate(e.date)}. It may still be open, or it may have settled. Only you know.`, evidence: [e.id] }]
        : [];
    })
    .filter(keep)
    .slice(0, 2);

  // Suggestions only follow something that recurred, never a single hard day or a feeling alone.
  const actions: SuggestedAction[] = recurring
    .filter((m) => m.rule.action)
    .sort((a, b) => Number(b.rule.kind === 'concern') - Number(a.rule.kind === 'concern') || b.hits.length - a.hits.length)
    .map(({ rule, hits }) => {
      const value = compassFor(rule);
      return {
        id: `action:${rule.id}`,
        text: rule.action!,
        why: `Because ${rule.label} came up in ${hits.length} entries.${value ? ` You named “${value}” as a priority, if that still fits.` : ''}`,
        evidence: hits.map((e) => e.id),
        compassValue: value,
      };
    })
    .filter(keep)
    .slice(0, 2);

  return {
    status: 'ready',
    review: {
      from: req.from,
      to: req.to,
      entryCount: entries.length,
      themes: themes.filter(keep),
      patterns: patterns.filter(keep),
      strengths: strengths.filter(keep),
      concerns,
      actions,
      simulated: true,
    },
  };
}

/** The feeling shared by the most entries of a theme, if at least two share it. Skips the theme's own defining feelings. */
function commonFeeling(hits: EntryContext[], defining: string[]) {
  const by = new Map<string, string[]>();
  for (const e of hits) for (const f of e.feelings) if (!defining.includes(f)) by.set(f, [...(by.get(f) ?? []), e.id]);
  const [name, ids] = [...by.entries()].sort((a, b) => b[1].length - a[1].length)[0] ?? [];
  return name && ids && ids.length >= MIN_REPEAT ? { name, ids } : null;
}

function openSentence(body: string) {
  const sentences = body.match(/[^.!?\n]+[.!?]?/g) ?? [];
  const hit = sentences.map((s) => s.trim()).find((s) => OPEN_MARKERS.some((m) => s.toLowerCase().includes(m)));
  if (!hit) return null;
  return hit.length > 140 ? `${hit.slice(0, 137).trimEnd()}…` : hit;
}
