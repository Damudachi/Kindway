import type { EntryContext } from './types';

/**
 * Keyword rules the mock uses in place of real analysis. They only ever point at entries
 * that contain the words, so the mock can't claim a theme the writing doesn't show.
 */
export type ThemeRule = {
  id: string;
  /** Short noun phrase used inside sentences. */
  label: string;
  title: string;
  kind: 'concern' | 'neutral' | 'strength';
  words: string[];
  feelings?: string[];
  /** Compass areas this could relate to. A compass link is only offered through this list. */
  areas: string[];
  /** Optional, small suggestion for a recurring concern. */
  action?: string;
};

export const THEME_RULES: ThemeRule[] = [
  {
    id: 'comparison',
    label: 'comparing yourself with others',
    title: 'Comparing your progress with others',
    kind: 'concern',
    words: ['compar', 'other people', 'everyone else', 'how far', 'fall behind', 'behind'],
    areas: ['Growth & learning', 'Career & purpose'],
    action: 'Once this week, compare something you made with your own work from a month ago, rather than with someone else’s.',
  },
  {
    id: 'workload',
    label: 'feeling stretched',
    title: 'Feeling stretched by how much there is',
    kind: 'concern',
    words: ['overwhelm', 'too much', 'everything i need', 'so much to do', 'deadline', 'tabs open'],
    feelings: ['Overwhelmed'],
    areas: ['Health & peace', 'Career & purpose'],
    action: 'Before one busy evening, decide what “enough for today” is, and stop there.',
  },
  {
    id: 'speaking-up',
    label: 'holding back in groups',
    title: 'Holding back in groups',
    kind: 'concern',
    words: ['stayed quiet', 'kept quiet', 'speak up', 'didn’t say', "didn't say"],
    areas: ['Relationships', 'Career & purpose'],
    action: 'If it feels okay, say one small thing early in your next group conversation.',
  },
  {
    id: 'rest',
    label: 'tiredness and rest',
    title: 'Tiredness and rest',
    kind: 'neutral',
    words: ['tired', 'exhausted', 'sleep', 'slow down', 'rest'],
    feelings: ['Tired'],
    areas: ['Health & peace'],
    action: 'Pick one evening this week that’s just for rest, with nothing to catch up on.',
  },
  {
    id: 'learning',
    label: 'learning',
    title: 'Wanting to learn and improve',
    kind: 'strength',
    words: ['learn', 'notes', 'study', 'understand', 'improve'],
    areas: ['Growth & learning'],
  },
  {
    id: 'good-moments',
    label: 'things going better than expected',
    title: 'Moments that went better than expected',
    kind: 'strength',
    words: ['better than i expected', 'better than expected', 'went well', 'proud'],
    feelings: ['Proud', 'Hopeful', 'Calm'],
    areas: ['Growth & learning', 'Health & peace'],
  },
  {
    id: 'connection',
    label: 'people who showed up for you',
    title: 'People who showed up for you',
    kind: 'strength',
    words: ['friend', 'saved me', 'helped me', 'together', 'saving me'],
    areas: ['Relationships'],
  },
];

export const POSITIVE_FEELINGS = ['Calm', 'Hopeful', 'Grateful', 'Proud'];

export function matchesRule(rule: ThemeRule, e: EntryContext) {
  const text = `${e.body} ${e.gratitude ?? ''}`.toLowerCase();
  if (rule.words.some((w) => text.includes(w))) return true;
  if (rule.id === 'connection' && e.gratitude) return true;
  return !!rule.feelings?.some((f) => e.feelings.includes(f));
}

export function rulesFor(e: EntryContext) {
  return THEME_RULES.filter((r) => matchesRule(r, e));
}
