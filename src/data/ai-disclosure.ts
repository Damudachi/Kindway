import type { AiScope } from '@/services/ai/consent';

/**
 * What the user agrees to when they allow AI processing. This wording is versioned: any change
 * here needs a new version in CURRENT_TERMS (src/services/ai/consent.ts) and on the server
 * (supabase/functions/_shared/ai-consent.ts), so people are asked again.
 *
 * Provider facts are from Groq's "Your data" page (console.groq.com/docs/your-data), checked on
 * 2026-10-28. The owner turned on Zero Data Retention in Kindway's Groq account (Data Controls) on
 * 2026-10-28; this says so, and doesn't claim anyone else verified it. If that setting changes,
 * rewrite the retention lines and bump the disclosure version; don't edit them in place.
 */
export const SCOPE_COPY: Record<AiScope, { title: string; when: string; sent: string[]; notSent: string[] }> = {
  entry_reflection: {
    title: 'Reflections on an entry',
    when: 'Only when you ask for a reflection on a specific entry.',
    sent: [
      'The text of that entry, its feeling tags and its “one good thing”.',
      'If “What reflections can see” is “This entry and recent ones”: the dates, feeling tags and text of up to 5 of your most recent entries from the 14 days before that entry, each cut to its first 600 characters. Entries you kept out of analysis are never included. Not sent when it is set to “This entry only”.',
      'Your support style and challenge settings for that reflection.',
      'For each compass value you linked to that entry and marked “AI may use this”: its name and your note about it (up to the first 400 characters). Not sent when “What reflections can see” is “This entry only”.',
    ],
    notSent: [
      'Older entries, or more than 5 earlier entries, entries you kept out of analysis, compass values you didn’t link to that entry or didn’t mark “AI may use this”, your email address or your account details.',
    ],
  },
  follow_up: {
    title: 'Follow-up conversations',
    when: 'Only when you send a message in the conversation about one entry. Separate from reflections: allowing reflections doesn’t allow this.',
    sent: [
      'Your message.',
      'The text of that entry, its feeling tags and its “one good thing”.',
      'The AI reflection on that entry shown with it, if there is one.',
      'Up to the last 3 AI replies of that conversation, with the messages they answered.',
      'Your support style and challenge settings for that reply.',
    ],
    notSent: ['Your other entries, other conversations, reviews, compass values, your email address or your account details.'],
  },
  cross_entry_analysis: {
    title: 'Reviews across entries',
    when: 'Only when you ask for a review. You choose “This week”, “Last 30 days” or “All entries”, and you see how many entries and which dates are included before anything is sent.',
    sent: [
      'The text of the entries in that period, with their feeling tags, “one good thing” and “come back to this” marks.',
      'For “All entries”: not your whole journal, but your most recent entries, up to 25 and about 20,000 characters in all, however old they are.',
      'Compass values, only if “Count my compass links” is on.',
    ],
    notSent: [
      'Entries you kept out of analysis, entries outside the period you chose, for “All entries” any entries beyond the 25 most recent, your email address or your account details.',
    ],
  },
};

export const PROVIDER_COPY = {
  name: 'GroqCloud',
  who: 'GroqCloud, run by Groq, Inc. (United States). It runs the open-weight model openai/gpt-oss-120b for Kindway.',
  retention: [
    'Groq says it doesn’t keep what is sent or generated.',
    'Zero Data Retention is turned on in Kindway’s Groq account, so Groq doesn’t log inputs or outputs for reliability or abuse checks either.',
    'Groq collects usage metadata (such as request counts and timing), which it says doesn’t include the content. Data Groq keeps is stored in the United States.',
    'Kindway uses only Groq’s ordinary inference service, not features that store files or train models.',
  ],
  separate:
    'If cloud backup is on, your entries are already in Kindway’s database (hosted by Supabase). Sending one to AI is a separate step that happens only when you ask.',
  limits: [
    'Replies are written by an AI model, not by you or a person, and they can be wrong.',
    'Kindway is not a therapist or an emergency service, and it can’t promise the confidentiality of a licensed professional.',
  ],
  checked: 'Provider details checked on 20 October 2026.',
} as const;
