// A conservative first screen for possible high-risk content, run on the server before anything
// is sent to a model. If it matches, Kindway shows its reviewed support route instead of an AI
// reply. It is one layer only: the model is also asked to flag possible risk (safety_concern),
// and the app has its own check before a request.
//
// PLACEHOLDER: this phrase list has not been clinically reviewed. It will miss things and will
// sometimes match harmless text. Do not describe Kindway as able to detect a crisis.
const PHRASES = [
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

export function needsSafetyRoute(...texts: (string | null | undefined)[]) {
  return texts.some((t) => {
    if (!t) return false;
    const s = t.toLowerCase().replace(/[’‘]/g, "'");
    return PHRASES.some((p) => s.includes(p));
  });
}
