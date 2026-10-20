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
//   AI_REFLECTION_COOLDOWN_SECONDS / AI_REFLECTION_DAILY_LIMIT             (default 10 / 30)
//   AI_INSIGHTS_COOLDOWN_SECONDS / AI_INSIGHTS_DAILY_LIMIT                 (default 60 / 5)
import { AI_CONSENT_TERMS } from './ai-consent.ts';

export type Limits = { cooldownSeconds: number; dailyLimit: number };

export type AiConfig = {
  provider: 'groq';
  model: string;
  apiKey: string;
  timeoutMs: number;
  reflection: { maxTokens: number; maxEntryChars: number } & Limits;
  insights: { maxTokens: number; maxEntries: number; maxChars: number; minEntries: number } & Limits;
};

/** The existing three-entry minimum: a product heuristic, not a validated threshold. */
export const MIN_INSIGHT_ENTRIES = 3;

type Env = (name: string) => string | undefined;

/** Why AI isn't configured. A code for logs; never shown to users. */
export type ConfigProblem = 'missing_key' | 'unknown_provider' | 'model_not_disclosed' | `invalid:${string}`;

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
      cooldownSeconds: int('AI_INSIGHTS_COOLDOWN_SECONDS', 60, 0, 86400),
      dailyLimit: int('AI_INSIGHTS_DAILY_LIMIT', 5, 1, 100),
    },
  };
  if (bad.length > 0) return { ok: false, problem: `invalid:${bad.join(',')}` };
  if (!config.apiKey) return { ok: false, problem: 'missing_key' };
  return { ok: true, config };
}
