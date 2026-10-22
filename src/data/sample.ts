// Option lists, plus clearly fictional sample content used only by the sample-insights demo and tests.
// Sample entries are never added to a user's journal.
import type { CompassValue, Entry, SupportStyle } from './types';

export const SUPPORT_STYLES: { id: SupportStyle; title: string; detail: string }[] = [
  { id: 'listen', title: 'Just listen', detail: 'Let me get it out before we try to solve anything.' },
  { id: 'understand', title: 'Help me understand', detail: 'Help me make sense of the situation and my feelings.' },
  { id: 'honest', title: 'Be honest with me', detail: 'Gently point out what I might be missing.' },
  { id: 'forward', title: 'Help me move forward', detail: 'Help me find a reasonable next step.' },
];

export const STYLE_LABEL: Record<SupportStyle, string> = {
  listen: 'Just listen',
  understand: 'Help me understand',
  honest: 'Be honest with me',
  forward: 'Help me move forward',
  ask: 'Ask me each time',
};

export const COMPASS_AREAS = [
  'Growth & learning',
  'Career & purpose',
  'Relationships',
  'Health & peace',
  'Independence',
  'Creativity',
  'Faith & meaning',
];

/** Example text for each area's optional note. Shown as a placeholder only; never saved. */
export const COMPASS_EXAMPLES: Record<string, string> = {
  'Growth & learning': 'For example: read one chapter a week, even on busy weeks',
  'Career & purpose': 'For example: finish my portfolio this term',
  Relationships: 'For example: call my sister on Sundays',
  'Health & peace': 'For example: be in bed by eleven most nights',
  Independence: 'For example: cook for myself instead of ordering in',
  Creativity: 'For example: sketch something small every day',
  'Faith & meaning': 'For example: keep a few quiet minutes for prayer or stillness each morning',
};

export const FEELINGS = ['Overwhelmed', 'Worried', 'Tired', 'Lonely', 'Calm', 'Hopeful', 'Grateful', 'Proud'];

export const PROMPTS = [
  { id: 'heavy', label: 'What felt heavy?', insert: 'What felt heavy today was…' },
  { id: 'mattered', label: 'What mattered?', insert: 'Something that mattered today…' },
  { id: 'need', label: 'What do I need?', insert: 'Right now, I think I need…' },
  { id: 'facts', label: 'Separate facts from fears', insert: 'What I know for sure: …\nWhat I might be assuming: …' },
];

export const HOME_PROMPTS = [
  'What are you carrying into tonight?',
  'What took more energy than you expected?',
  'What would you like to set down before sleep?',
];

export const SAMPLE_COMPASS: CompassValue[] = [
  { id: 'c1', area: 'Growth & learning', note: 'Keep learning, even when progress feels slow.', aiMayReference: true },
  { id: 'c2', area: 'Career & purpose', note: 'Build useful things and become a thoughtful engineer.', aiMayReference: true },
];


export const SAMPLE_ENTRIES: Entry[] = [
  {
    id: 'e4',
    date: '2026-10-16T21:40:00',
    title: 'Too many tabs open',
    body: "I'm feeling a little overwhelmed by everything I need to do. I keep thinking that if I slow down, I'll fall behind.",
    feelings: ['Overwhelmed'],
    reflectionStatus: 'ready',
    sample: true,
    reflection: {
      style: 'understand',
      acknowledge: 'That sounds like a lot to hold at once. It makes sense to feel stretched.',
      clarify: 'You have a long list today. "If I slow down, I\'ll fall behind" is a rule you might be living by, not a fact you have checked.',
      perspective: 'Slowing down for one evening is different from stopping. Rest can be part of keeping up.',
      question: 'What would "enough for today" look like if it were based on your priorities?',
      basedOn: "I'm feeling a little overwhelmed by everything I need to do. I keep thinking that if I slow down, I'll fall behind.",
    },
  },
  {
    id: 'e3',
    date: '2026-10-15T22:05:00',
    title: 'When I started comparing',
    body: "I saw how far other people seemed to be and started questioning my own progress. I know everyone's path is different, but it still got to me.",
    feelings: ['Worried'],
    reflectionStatus: 'ready',
    sample: true,
    reflection: {
      style: 'honest',
      acknowledge: 'It hurts to feel behind, especially about something you care about.',
      clarify: 'You saw other people\'s visible milestones. You did not see their whole path, and they did not see yours.',
      perspective: 'Comparison can turn someone else\'s highlight into a measure of your entire journey.',
      longGame: { value: 'Growth & learning', text: 'You said learning matters to you. Comparing with your own earlier work might be a fairer measure.' },
      question: 'What would it look like to compare yourself with who you were three months ago?',
      basedOn: "I saw how far other people seemed to be and started questioning my own progress. I know everyone's path is different, but it still got to me.",
    },
  },
  {
    id: 'e2',
    date: '2026-10-14T20:30:00',
    title: 'A small win I nearly missed',
    body: 'The study group actually used my notes today. I almost brushed it off, but it went better than I expected.',
    feelings: ['Proud', 'Hopeful'],
    gratitude: 'Mina saving me a seat.',
    reflectionStatus: 'none',
    sample: true,
  },
  {
    id: 'e1',
    date: '2026-10-12T23:10:00',
    title: 'Group project, again',
    body: 'Everyone else seemed to know exactly what they were doing. I stayed quiet and then felt annoyed at myself for staying quiet.',
    feelings: ['Lonely', 'Worried'],
    reflectionStatus: 'none',
    sample: true,
  },
];
