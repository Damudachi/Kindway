// Server-side AI settings, read from Edge Function environment variables (Supabase secrets).
// Nothing here ships in the app. Every number is validated against a safe range; an invalid
// setting makes AI fail closed with `not_configured` instead of running with a guess.
//
// Settings (all optional except GROQ_API_KEY):
//   AI_PROVIDER                  groq (the only adapter today)
//   AI_MODEL                     must equal the model named in the consent disclosure
//   AI_TIMEOUT_MS                provider timeout per attempt              (default 20000)
//   AI_REFLECTION_MAX_TOKENS     output budget for a reflection            (default 1200)
//   AI_INSIGHTS_MAX_TOKENS       output budget for a review                (default 2500)
//   AI_MAX_ENTRY_CHARS           longest entry a reflection accepts        (default 8000)
//   AI_INSIGHTS_MAX_ENTRIES      most entries one review may send          (default 20)
//   AI_INSIGHTS_MAX_CHARS        combined text one review may send         (default 12000)
//   AI_INSIGHTS_LATEST_MAX_ENTRIES / AI_INSIGHTS_LATEST_MAX_CHARS          (default 25 / 20000)
//                                the same limits for a review of the latest entries ("all"); the
//                                consent wording states these numbers, so changing them means a new
//                                consent version first
//   AI_REFLECTION_COOLDOWN_SECONDS / AI_REFLECTION_DAILY_LIMIT             (default 10 / 30)
//   AI_INSIGHTS_COOLDOWN_SECONDS / AI_INSIGHTS_DAILY_LIMIT                 (default 60 / 5)
//   AI_FOLLOW_UP_MAX_TOKENS      output budget for a follow-up reply       (default 700)
//   AI_FOLLOW_UP_MAX_CHARS       longest follow-up message                 (default 1500)
//   AI_FOLLOW_UP_MAX_TURNS       earlier exchanges sent as context         (default 3)
//   AI_FOLLOW_UP_COOLDOWN_SECONDS / AI_FOLLOW_UP_DAILY_LIMIT               (default 5 / 60)
import { AI_CONSENT_TERMS } from './ai-consent.ts';
import { serverKey } from './server-key.ts';

export type Limits = { cooldownSeconds: number; dailyLimit: number };

export type AiConfig = {
  provider: 'groq';
  model: string;
  apiKey: string;
  timeoutMs: number;
  reflection: { maxTokens: number; maxEntryChars: number } & Limits;
  insights: { maxTokens: number; maxEntries: number; maxChars: number; minEntries: number; latest: { maxEntries: number; maxChars: number } } & Limits;
  followUp: { maxTokens: number; maxMessageChars: number; maxTurns: number } & Limits;
};

/** The existing three-entry minimum: a product heuristic, not a validated threshold. */
export const MIN_INSIGHT_ENTRIES = 3;

type Env = (name: string) => string | undefined;

/** Why AI isn't configured. A code for logs; never shown to users. */
export type ConfigProblem = 'missing_key' | 'server_key_missing' | 'unknown_provider' | 'model_not_disclosed' | `invalid:${string}`;

export function loadAiConfig(env: Env): { ok: true; config: AiConfig } | { ok: false; problem: ConfigProblem } {
  const bad: string[] = [];
  const int = (name: string, fallback: number, min: number, max: number) => {
    const raw = env(name);
    if (raw === undefined || raw === '') return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) bad.push(name);
    return n;
  };

  const provider = env('AI_PROVIDER') || 'groq';
  if (provider !== 'groq') return { ok: false, problem: 'unknown_provider' };
  // The consent disclosure names one model. Running another would make it inaccurate, so a
  // model change needs a new disclosure version first (see docs/supabase-setup.md).
  const model = env('AI_MODEL') || AI_CONSENT_TERMS.modelRef;
  if (model !== AI_CONSENT_TERMS.modelRef) return { ok: false, problem: 'model_not_disclosed' };

  const config: AiConfig = {
    provider,
    model,
    apiKey: env('GROQ_API_KEY') ?? '',
    timeoutMs: int('AI_TIMEOUT_MS', 20000, 2000, 60000),
    reflection: {
      maxTokens: int('AI_REFLECTION_MAX_TOKENS', 1200, 300, 4000),
      maxEntryChars: int('AI_MAX_ENTRY_CHARS', 8000, 500, 20000),
      cooldownSeconds: int('AI_REFLECTION_COOLDOWN_SECONDS', 10, 0, 3600),
      dailyLimit: int('AI_REFLECTION_DAILY_LIMIT', 30, 1, 500),
    },
    insights: {
      maxTokens: int('AI_INSIGHTS_MAX_TOKENS', 2500, 500, 6000),
      maxEntries: int('AI_INSIGHTS_MAX_ENTRIES', 20, MIN_INSIGHT_ENTRIES, 60),
      maxChars: int('AI_INSIGHTS_MAX_CHARS', 12000, 1000, 40000),
      minEntries: MIN_INSIGHT_ENTRIES,
      latest: {
        maxEntries: int('AI_INSIGHTS_LATEST_MAX_ENTRIES', 25, MIN_INSIGHT_ENTRIES, 60),
        maxChars: int('AI_INSIGHTS_LATEST_MAX_CHARS', 20000, 1000, 40000),
      },
      cooldownSeconds: int('AI_INSIGHTS_COOLDOWN_SECONDS', 60, 0, 86400),
      dailyLimit: int('AI_INSIGHTS_DAILY_LIMIT', 5, 1, 100),
    },
    followUp: {
      maxTokens: int('AI_FOLLOW_UP_MAX_TOKENS', 700, 200, 2000),
      // The database allows 2000; requests are also capped at MAX_BODY_BYTES.
      maxMessageChars: int('AI_FOLLOW_UP_MAX_CHARS', 1500, 100, 2000),
      maxTurns: int('AI_FOLLOW_UP_MAX_TURNS', 3, 0, 6),
      cooldownSeconds: int('AI_FOLLOW_UP_COOLDOWN_SECONDS', 5, 0, 3600),
      dailyLimit: int('AI_FOLLOW_UP_DAILY_LIMIT', 60, 1, 500),
    },
  };
  if (bad.length > 0) return { ok: false, problem: `invalid:${bad.join(',')}` };
  if (!config.apiKey) return { ok: false, problem: 'missing_key' };
  // AI rows and the request ledger are written with the server key (see ai-store.ts).
  if (!serverKey(env)) return { ok: false, problem: 'server_key_missing' };
  return { ok: true, config };
}
