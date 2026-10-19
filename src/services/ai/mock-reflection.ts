import type { Reflection, SupportStyle } from '@/data/types';

import { POSITIVE_FEELINGS, rulesFor } from './mock-themes';
import type { ReflectionRequest } from './types';

type Style = Exclude<SupportStyle, 'ask'>;
type Parts = Pick<Reflection, 'acknowledge' | 'clarify' | 'perspective' | 'nextStep' | 'question'>;

const HARD: Record<Style, Parts> = {
  listen: {
    acknowledge: 'Thank you for writing this down. It sounds like today asked a lot of you, and you don’t need to explain or fix any of it right now.',
    question: 'Is there anything else you want to get out before you rest?',
  },
  understand: {
    acknowledge: 'That sounds heavy. It makes sense that it stayed with you.',
    clarify: 'Some of what you wrote is what happened. Some of it may be a conclusion you drew from it. Both are worth looking at.',
    perspective: 'A hard day can feel like the whole story while you’re inside it. It might be one chapter.',
    question: 'What part of today do you most want to understand?',
  },
  honest: {
    acknowledge: 'That sounds hard, and your feelings about it are real.',
    clarify: 'You might be treating one moment as proof of something bigger. Is there anything that points the other way?',
    perspective: 'Being honest with yourself includes noticing what went okay, too.',
    question: 'If you looked at this a week from now, what do you think you’d see?',
  },
  forward: {
    acknowledge: 'It sounds like you want things to feel a little different.',
    perspective: 'You don’t need a whole plan. Choosing rest can also be a step forward.',
    nextStep: 'If it helps, pick one small thing for tomorrow that would make the day a bit easier, like starting with ten minutes on whatever feels hardest.',
  },
};

const GOOD: Record<Style, Parts> = {
  listen: {
    acknowledge: 'Thank you for writing this down. It sounds like something went well, and it’s worth letting that land.',
  },
  understand: {
    acknowledge: 'It sounds like something went better than you expected.',
    perspective: 'Good moments are easy to brush past. Noticing them is part of seeing the whole picture.',
    question: 'What do you think made today go the way it did?',
  },
  honest: {
    acknowledge: 'It sounds like something went well, and you noticed it.',
    clarify: 'Good things are easy to brush off as luck. It might be worth letting yourself count this one.',
    question: 'What would change if you gave yourself credit for this?',
  },
  forward: {
    acknowledge: 'It sounds like something went well today.',
    perspective: 'What worked once can sometimes be repeated on purpose.',
    nextStep: 'If you want, note one thing you did today that you could do again this week.',
  },
};

/**
 * Builds a simulated reflection from the request alone. No model is involved:
 * the wording is pre-written and chosen by support style, feelings and simple keyword rules.
 */
export function mockReflection(req: ReflectionRequest): Reflection {
  const style: Style = req.style === 'ask' ? 'understand' : req.style;
  const { entry } = req;
  const positive = entry.feelings.length > 0 && entry.feelings.every((f) => POSITIVE_FEELINGS.includes(f));
  const parts: Parts = { ...(positive ? GOOD : HARD)[style] };

  // "Help me understand" only questions conclusions when the user turned on gentle challenge.
  if (style === 'understand' && !req.challengeGently) delete parts.clarify;

  // "Just listen" stays acknowledgment only: no compass, no past entries, no advice.
  if (style === 'listen') return { style: req.style, ...parts, basedOn: entry.body };

  const rules = rulesFor(entry);
  const area = req.compass.find((c) => c.aiMayReference && rules.some((r) => r.areas.includes(c.area)))?.area;
  const related = req.pastEntries
    .filter((p) => p.id !== entry.id && rules.some((r) => r.kind !== 'strength' && rulesFor(p).includes(r)))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 2)
    .map((p) => p.id);

  return {
    style: req.style,
    ...parts,
    // Worded so a hard feeling is never framed as failing the value.
    longGame: area
      ? {
          value: area,
          text: positive
            ? `You named “${area}” as something that matters to you. This might be a small part of it.`
            : `You named “${area}” as something that matters to you. If it feels relevant, it could be one lens on today. If it doesn’t, leave it.`,
        }
      : undefined,
    related: related.length > 0 ? related : undefined,
    basedOn: entry.body,
  };
}
