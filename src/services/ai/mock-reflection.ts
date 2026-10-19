import type { Reflection, SupportStyle } from '@/data/types';

import type { ReflectionRequest } from './types';

type Style = Exclude<SupportStyle, 'ask'>;
/** Chosen only from the feeling tags the user added; the text itself is never interpreted. */
type Tone = 'hard' | 'good' | 'untagged';
type Template = {
  acknowledge: string;
  clarify?: string;
  /** Alternatives for "Try another perspective". */
  perspectives?: string[];
  nextStep?: string;
  question?: string;
};

export const POSITIVE_FEELINGS = ['Calm', 'Hopeful', 'Grateful', 'Proud'];

const TEMPLATES: Record<Tone, Record<Style, Template>> = {
  hard: {
    listen: {
      acknowledge: 'Thank you for writing this down. It sounds like today asked a lot of you, and you don’t need to explain or fix any of it right now.',
      question: 'Is there anything else you want to get out before you rest?',
    },
    understand: {
      acknowledge: 'That sounds heavy. It makes sense that it stayed with you.',
      clarify: 'Some of what you wrote may be what happened, and some may be a conclusion you drew from it. Only you can tell which is which.',
      perspectives: [
        'A hard day can feel like the whole story while you’re inside it. It might turn out to be one chapter.',
        'It’s also possible the feeling is a fair response to a hard situation. It doesn’t have to be argued with.',
        'What you need tonight might be different from what you need to figure out. Both can wait their turn.',
      ],
      question: 'What part of this do you most want to understand?',
    },
    honest: {
      acknowledge: 'That sounds hard, and your feelings about it are real.',
      clarify: 'If any part of this feels like proof of something bigger about you, it may be worth asking whether one moment can carry that much weight.',
      perspectives: [
        'Being honest with yourself includes noticing what went okay, too.',
        'Sometimes the honest answer is that something really was unfair or disappointing. Naming that is honest too.',
        'You might ask what you’d say to a friend who wrote this. Then check whether it applies to you.',
      ],
      question: 'If you looked at this a week from now, what do you think you’d see?',
    },
    forward: {
      acknowledge: 'It sounds like you want things to feel a little different.',
      perspectives: [
        'You don’t need a whole plan. Choosing rest can also be a step forward.',
        'Sometimes the most useful next step is waiting until you know more. That counts.',
        'A small step that’s easy to start often helps more than a big one that’s hard to begin.',
      ],
      nextStep: 'If it helps, pick one small thing for tomorrow, like starting with ten minutes on whatever feels hardest. Or choose rest.',
    },
  },
  good: {
    listen: {
      acknowledge: 'Thank you for writing this down. It sounds like something went well, and it’s worth letting that land.',
    },
    understand: {
      acknowledge: 'It sounds like something felt good today.',
      perspectives: [
        'Good moments are easy to brush past. Noticing them is part of seeing the whole picture.',
        'It might be worth knowing what made this possible, so it’s easier to find again.',
      ],
      question: 'What do you think made today go the way it did?',
    },
    honest: {
      acknowledge: 'It sounds like something went well, and you noticed it.',
      clarify: 'Good things are easy to put down to luck. It might be worth letting yourself count this one.',
      perspectives: ['You were part of what went well today, even if others were too.', 'Letting a good day count doesn’t mean pretending the hard ones away.'],
      question: 'What would change if you gave yourself credit for this?',
    },
    forward: {
      acknowledge: 'It sounds like something went well today.',
      perspectives: ['What worked once can sometimes be repeated on purpose.', 'You don’t have to build on it right away. Enjoying it is enough.'],
      nextStep: 'If you want, note one thing you did today that you could do again this week.',
    },
  },
  untagged: {
    listen: {
      acknowledge: 'Thank you for writing this down. It’s here now, in your own words, and you don’t need to do anything else with it.',
    },
    understand: {
      acknowledge: 'Thank you for putting this into words.',
      perspectives: [
        'Sometimes writing something down shows which part of it matters most.',
        'There may be more than one way to read this day, and you don’t have to pick one tonight.',
      ],
      question: 'Which part of what you wrote feels most important?',
    },
    honest: {
      acknowledge: 'Thank you for writing this down honestly.',
      perspectives: ['It can help to separate what happened from what it seemed to mean.', 'You might notice whether anything here is a story you’ve told yourself before.'],
      question: 'Is there anything in this you’re not quite saying?',
    },
    forward: {
      acknowledge: 'Thank you for writing this down.',
      perspectives: ['Not every day needs a next step.', 'If something here wants attention, it can be small.'],
      nextStep: 'If anything here needs a next step, keep it small. If nothing does, that’s fine too.',
    },
  },
};

export function toneOf(feelings: string[]): Tone {
  if (feelings.length === 0) return 'untagged';
  return feelings.every((f) => POSITIVE_FEELINGS.includes(f)) ? 'good' : 'hard';
}

/**
 * Builds a simulated reflection. No model is involved and the entry text is not interpreted:
 * wording is pre-written and chosen by support style, the user's own feeling tags, and the
 * compass values they linked. It's labelled as simulated wherever it's shown.
 */
export function mockReflection(req: ReflectionRequest): Reflection {
  const style: Style = req.style === 'ask' ? 'understand' : req.style;
  const { entry } = req;
  const tone = toneOf(entry.feelings);
  const t = TEMPLATES[tone][style];
  const variant = req.variant ?? 0;
  const base = { style: req.style, acknowledge: t.acknowledge, basedOn: entry.body, variant };

  // "Just listen" stays acknowledgment only: no challenge, compass, past entries or advice.
  if (style === 'listen') return t.question ? { ...base, question: t.question } : base;

  // "Help me understand" only questions conclusions when the user turned on gentle challenge.
  const clarify = style === 'understand' && !req.challengeGently ? undefined : t.clarify;
  const value = req.compass.find((c) => c.aiMayReference && entry.compassIds?.includes(c.id));
  const related = req.pastEntries
    .filter((p) => p.id !== entry.id && p.feelings.some((f) => entry.feelings.includes(f)))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 2)
    .map((p) => p.id);

  return {
    ...base,
    ...(clarify && { clarify }),
    ...(t.perspectives && { perspective: t.perspectives[variant % t.perspectives.length] }),
    ...(t.nextStep && { nextStep: t.nextStep }),
    ...(t.question && { question: t.question }),
    // Worded so a hard feeling is never framed as failing the value.
    ...(value && {
      longGame: {
        value: value.area,
        text:
          tone === 'good'
            ? `You connected this entry to “${value.area}”. It might be a small part of what that means to you.`
            : `You connected this entry to “${value.area}”. If it helps, it could be one lens on today. If it doesn’t, leave it.`,
      },
    }),
    ...(related.length > 0 && { related }),
  };
}

/** How many different perspectives exist for this request, so the UI can say when it has cycled. */
export function perspectiveCount(style: SupportStyle, feelings: string[]) {
  return TEMPLATES[toneOf(feelings)][style === 'ask' ? 'understand' : style].perspectives?.length ?? 0;
}
