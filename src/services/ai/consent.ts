import type { SupabaseClient } from '@supabase/supabase-js';

import { CloudError, fail } from '@/services/cloud/repo';

/**
 * Consent to send writing to a real AI provider, recorded on the user's account. It is separate
 * from the "reflection previews" switch, which only controls the simulated on-device previews.
 *
 * Three scopes, granted and withdrawn independently. A grant is valid only for the terms below;
 * when any of them changes, the user is asked again. The server checks the same terms
 * (supabase/functions/_shared/ai-consent.ts) and refuses AI requests without an active grant.
 *
 * Changing the disclosure copy in src/data/ai-disclosure.ts means bumping these versions.
 */
export type AiScope = 'entry_reflection' | 'cross_entry_analysis' | 'follow_up';

export const AI_SCOPES: AiScope[] = ['entry_reflection', 'follow_up', 'cross_entry_analysis'];

export const CURRENT_TERMS = {
  provider: 'groq',
  modelRef: 'openai/gpt-oss-120b',
  disclosureVersion: 'groq-zdr-2026-10-28',
  consentVersion: { entry_reflection: '3', cross_entry_analysis: '2', follow_up: '1' } satisfies Record<AiScope, string>,
} as const;

export type ConsentRecord = {
  id: string;
  scope: AiScope;
  consentVersion: string;
  disclosureVersion: string;
  provider: string;
  modelRef: string;
  acceptedAt: string;
  revokedAt: string | null;
};

/**
 * - `none`: never agreed.
 * - `active`: agreed to the current terms.
 * - `outdated`: agreed to earlier terms; counts as no consent until they agree again.
 * - `withdrawn`: agreed, then withdrew.
 */
export type ConsentStatus = 'none' | 'active' | 'outdated' | 'withdrawn';

const matchesCurrent = (r: ConsentRecord) =>
  r.provider === CURRENT_TERMS.provider &&
  r.disclosureVersion === CURRENT_TERMS.disclosureVersion &&
  r.consentVersion === CURRENT_TERMS.consentVersion[r.scope];

/** The latest record for a scope, newest first by acceptance. */
export function latestConsent(records: ConsentRecord[], scope: AiScope) {
  return records.filter((r) => r.scope === scope).sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt))[0];
}

export function consentStatus(records: ConsentRecord[], scope: AiScope): ConsentStatus {
  const latest = latestConsent(records, scope);
  if (!latest) return 'none';
  if (latest.revokedAt) return 'withdrawn';
  return matchesCurrent(latest) ? 'active' : 'outdated';
}

export interface ConsentRepo {
  /** The signed-in user's consent history, including withdrawn grants. */
  list(): Promise<ConsentRecord[]>;
  /** Agrees to the current terms for one scope, replacing any earlier grant for it. */
  grant(scope: AiScope): Promise<ConsentRecord>;
  /** Withdraws the active grant for one scope, if any. */
  revoke(scope: AiScope): Promise<void>;
}

type Row = {
  id: string;
  scope: AiScope;
  consent_version: string;
  disclosure_version: string;
  provider: string;
  model_ref: string;
  accepted_at: string;
  revoked_at: string | null;
};

const fromRow = (r: Row): ConsentRecord => ({
  id: r.id,
  scope: r.scope,
  consentVersion: r.consent_version,
  disclosureVersion: r.disclosure_version,
  provider: r.provider,
  modelRef: r.model_ref,
  acceptedAt: r.accepted_at,
  revokedAt: r.revoked_at,
});

/** Consent stored in Supabase, read and written as the signed-in user under RLS. */
export function supabaseConsentRepo(client: SupabaseClient): ConsentRepo {
  const guard = async <T>(run: () => Promise<T>) => {
    try {
      return await run();
    } catch (e) {
      if (e instanceof CloudError) throw e;
      throw new CloudError('Network unavailable', 'offline');
    }
  };
  return {
    list: () =>
      guard(async () => {
        const { data, error } = await client.from('ai_consents').select('*').order('accepted_at', { ascending: false });
        if (error) fail(error);
        return ((data ?? []) as Row[]).map(fromRow);
      }),
    grant: (scope) =>
      guard(async () => {
        const { data, error } = await client.rpc('grant_ai_consent', {
          p_scope: scope,
          p_consent_version: CURRENT_TERMS.consentVersion[scope],
          p_disclosure_version: CURRENT_TERMS.disclosureVersion,
          p_provider: CURRENT_TERMS.provider,
          p_model_ref: CURRENT_TERMS.modelRef,
        });
        if (error || !data) fail(error);
        return fromRow(data as Row);
      }),
    revoke: (scope) =>
      guard(async () => {
        const { error } = await client.rpc('revoke_ai_consent', { p_scope: scope });
        if (error) fail(error);
      }),
  };
}
