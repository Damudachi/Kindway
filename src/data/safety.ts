/**
 * Placeholder screen for possible high-risk content before an AI request.
 * TODO(safety): replace with a reviewed, server-side classifier and verified regional resources.
 */
const RISK_PHRASES = ['hurt myself', 'kill myself', 'end my life', 'suicide', "don't want to be alive", 'self harm', 'self-harm'];

export function looksHighRisk(text: string) {
  const t = text.toLowerCase();
  return RISK_PHRASES.some((p) => t.includes(p));
}
