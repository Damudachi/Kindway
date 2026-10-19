import { useEffect, useRef, useState } from 'react';

import type { InsightsResult } from '@/services/insights';

export type ReviewState = { status: 'loading' } | InsightsResult;

/**
 * Runs an insight review whenever `key` changes (period, the analysable data, or a retry),
 * and reports loading until the result for the current key arrives.
 */
export function useInsightsReview(load: () => Promise<InsightsResult>, key: string) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; value: InsightsResult } | null>(null);
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });
  const fullKey = `${key}#${attempt}`;

  useEffect(() => {
    let cancelled = false;
    void loader.current().then((value) => {
      if (!cancelled) setResult({ key: fullKey, value });
    });
    return () => {
      cancelled = true;
    };
  }, [fullKey]);

  const state: ReviewState = result?.key === fullKey ? result.value : { status: 'loading' };
  return [state, () => setAttempt((a) => a + 1)] as const;
}
