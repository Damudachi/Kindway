import type { CompassValue, Reflection, SupportStyle } from './types';

/**
 * Pre-written stand-in for an AI reflection. No AI provider is connected in this milestone;
 * the UI labels every reflection built here as an example.
 * TODO(ai): replace with the authenticated Edge Function → provider adapter call.
 */
export function demoReflection(text: string, style: SupportStyle, compass: CompassValue[]): Reflection {
  const value = compass.find((c) => c.aiMayReference);
  const s = style === 'ask' ? 'understand' : style;
  const byStyle: Record<Exclude<SupportStyle, 'ask'>, Pick<Reflection, 'acknowledge' | 'clarify' | 'perspective' | 'question'>> = {
    listen: {
      acknowledge: 'Thank you for writing this down. It sounds like today asked a lot of you.',
      clarify: 'You don\'t need to explain or fix any of it right now.',
      perspective: 'Sometimes naming what happened is enough for one evening.',
      question: 'Is there anything else you want to get out before you rest?',
    },
    understand: {
      acknowledge: 'That sounds heavy. It makes sense that it stayed with you.',
      clarify: 'Some of what you wrote is what happened. Some of it may be a conclusion you drew from it. Both are worth looking at.',
      perspective: 'A hard day can feel like the whole story while you\'re inside it.',
      question: 'What part of today do you most want to understand?',
    },
    honest: {
      acknowledge: 'That sounds hard, and your feelings about it are real.',
      clarify: 'You might be treating one moment as proof of something bigger. What evidence points the other way?',
      perspective: 'Being honest with yourself includes noticing what went okay, too.',
      question: 'If you looked at this a week from now, what do you think you\'d see?',
    },
    forward: {
      acknowledge: 'It sounds like you want things to feel a little different.',
      clarify: 'You don\'t need a whole plan. One small, kind step is enough.',
      perspective: 'Choosing rest is also a step forward.',
      question: 'What is one small thing that would make tomorrow a bit easier?',
    },
  };
  return {
    style,
    ...byStyle[s],
    longGame: value
      ? { value: value.area, text: `You said "${value.area}" matters to you. One hard day doesn't decide whether you can grow.` }
      : undefined,
    basedOn: text,
  };
}

/**
 * Placeholder screen for possible high-risk content before an AI request.
 * TODO(safety): replace with a reviewed, server-side classifier and verified regional resources.
 */
const RISK_PHRASES = ['hurt myself', 'kill myself', 'end my life', 'suicide', "don't want to be alive", 'self harm', 'self-harm'];

export function looksHighRisk(text: string) {
  const t = text.toLowerCase();
  return RISK_PHRASES.some((p) => t.includes(p));
}
