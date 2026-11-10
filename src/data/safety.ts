/**
 * Placeholder screen for possible high-risk content before an AI request, and before an old
 * entry is brought back to Today. Keep this list the same as the server's
 * (supabase/functions/_shared/safety.ts).
 * TODO(safety): replace with a reviewed, server-side classifier and verified regional resources.
 */
const RISK_PHRASES = [
  'hurt myself',
  'harm myself',
  'kill myself',
  'killing myself',
  'end my life',
  'end it all',
  'take my own life',
  'suicide',
  'suicidal',
  "don't want to be alive",
  'dont want to be alive',
  "don't want to live",
  'want to die',
  'wish i was dead',
  'wish i were dead',
  'better off without me',
  'no reason to live',
  'self harm',
  'self-harm',
  'cut myself',
  'overdose',
  'hurt someone',
  'kill someone',
  'kill him',
  'kill her',
  'kill them',
];

export function looksHighRisk(text: string) {
  const t = text.toLowerCase().replace(/[’‘]/g, "'");
  return RISK_PHRASES.some((p) => t.includes(p));
}
