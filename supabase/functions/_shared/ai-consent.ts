// Server-side gate for AI processing consent, shared by the AI Edge Functions (Phase 4B).
//
// Call it with a Supabase client that carries the caller's own access token, so the check runs
// under RLS as that user: there is no user id parameter to spoof. Any error, missing data or
// unexpected shape counts as "no consent" (fail closed).
//
// The required terms below must match what the app shows and records (src/services/ai/consent.ts);
// a Jest test keeps them in step. Changing the disclosure wording, the retention posture (for
// example after verifying Zero Data Retention in the provider console) or the provider means
// bumping the matching version here and in the app, which asks every user to agree again.
//
// No imports on purpose: this file runs in Deno on the server and in Jest for tests.

export type AiScope = 'entry_reflection' | 'cross_entry_analysis' | 'follow_up';

export const AI_CONSENT_TERMS = {
  provider: 'groq',
  modelRef: 'openai/gpt-oss-120b',
  disclosureVersion: 'groq-default-retention-2026-10-20',
  consentVersion: { entry_reflection: '1', cross_entry_analysis: '1', follow_up: '1' } satisfies Record<AiScope, string>,
} as const;

/** The minimal client surface used here; supabase-js clients satisfy it. */
export type RpcClient = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

export async function hasActiveConsent(client: RpcClient, scope: AiScope, terms = AI_CONSENT_TERMS): Promise<boolean> {
  try {
    const { data, error } = await client.rpc('ai_consent_active', {
      p_scope: scope,
      p_consent_version: terms.consentVersion[scope],
      p_disclosure_version: terms.disclosureVersion,
      p_provider: terms.provider,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}
