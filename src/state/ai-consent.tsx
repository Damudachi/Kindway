import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { AI_SCOPES, consentStatus, supabaseConsentRepo, type AiScope, type ConsentRecord, type ConsentRepo, type ConsentStatus } from '@/services/ai/consent';
import { supabase } from '@/services/supabase/client';
import { useSession } from '@/state/session';

/**
 * The signed-in user's AI processing consent, as recorded on the server. Without an account
 * there is nothing to record it against, so consent is `unavailable` and real AI stays off.
 * Nothing here is cached on the device: the server's record is the only source of truth.
 */
export type AiConsentInfo = {
  load: 'unavailable' | 'loading' | 'ready' | 'error';
  records: ConsentRecord[];
  status(scope: AiScope): ConsentStatus;
  grant(scope: AiScope): Promise<boolean>;
  revoke(scope: AiScope): Promise<boolean>;
  reload(): void;
};

const unavailable: AiConsentInfo = {
  load: 'unavailable',
  records: [],
  status: () => 'none',
  grant: async () => false,
  revoke: async () => false,
  reload: () => {},
};

const AiConsentContext = createContext<AiConsentInfo>(unavailable);

const defaultRepo = supabase ? supabaseConsentRepo(supabase) : null;

/** `value` is a test seam that replaces the computed state; the app never passes it. */
type Props = { children: ReactNode; repo?: ConsentRepo | null; value?: AiConsentInfo };

export function AiConsentProvider({ children, repo = defaultRepo, value: fixed }: Props) {
  const { user } = useSession();
  const userId = user?.id;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ userId: string; load: 'ready' | 'error'; records: ConsentRecord[] } | null>(null);

  useEffect(() => {
    if (!userId || !repo) return;
    let cancelled = false;
    repo
      .list()
      .then((records) => !cancelled && setResult({ userId, load: 'ready', records }))
      .catch(() => !cancelled && setResult({ userId, load: 'error', records: [] }));
    return () => {
      cancelled = true;
    };
  }, [userId, repo, attempt]);

  const reload = useCallback(() => setAttempt((a) => a + 1), []);

  const change = useCallback(
    async (run: () => Promise<unknown>) => {
      try {
        await run();
        return true;
      } catch {
        return false;
      } finally {
        // Always re-read: the server's record decides what the screen shows.
        reload();
      }
    },
    [reload],
  );

  const value = useMemo<AiConsentInfo>(() => {
    if (!userId || !repo) return unavailable;
    // Until this user's records arrive, show loading rather than another account's. A re-read
    // after a change keeps showing the last result until the new one lands.
    const current = result?.userId === userId ? result : { load: 'loading' as const, records: [] };
    return {
      load: current.load,
      records: current.records,
      status: (scope) => (current.load === 'ready' ? consentStatus(current.records, scope) : 'none'),
      grant: (scope) => change(() => repo.grant(scope)),
      revoke: (scope) => change(() => repo.revoke(scope)),
      reload,
    };
  }, [userId, repo, result, change, reload]);

  return <AiConsentContext value={fixed ?? value}>{children}</AiConsentContext>;
}

export function useAiConsent() {
  return use(AiConsentContext);
}

/** One line on where AI processing stands, for the rows that lead to its settings. */
export function consentSummary(consent: AiConsentInfo) {
  if (consent.load === 'unavailable') return 'Needs an account. Nothing is sent to AI.';
  if (consent.load === 'loading') return 'Checking your account…';
  if (consent.load === 'error') return 'Couldn’t check. Nothing is sent to AI.';
  const allowed = AI_SCOPES.filter((s) => consent.status(s) === 'active').length;
  return allowed === 0 ? 'Nothing allowed. Nothing is sent to AI.' : `${allowed} of ${AI_SCOPES.length} allowed.`;
}
