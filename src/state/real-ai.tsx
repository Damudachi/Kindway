import { createContext, use, useMemo, type ReactNode } from 'react';

import { supabaseAiOutputs, supabaseInvoke, type AiOutputsRepo, type Invoke } from '@/services/ai/remote';
import { supabase } from '@/services/supabase/client';
import { useAiConsent } from '@/state/ai-consent';
import { useSession } from '@/state/session';

/**
 * Whether real AI can run right now, per scope. It needs all three:
 * - an account with cloud backup on this device, because the server reads the entry from the
 *   account (the app never sends entry text itself);
 * - the matching consent, active under the current terms;
 * - a configured Supabase project.
 * The server checks consent again on every request; this only decides what the app offers.
 */
export type RealAi = {
  reflections: boolean;
  insights: boolean;
  /** Why real AI isn't offered, when it isn't. */
  needs: 'account' | 'cloud-sync' | null;
  /** The signed-in account these outputs belong to, so screens can drop another account's. */
  account: string | null;
  invoke: Invoke | null;
  outputs: AiOutputsRepo | null;
};

const off: RealAi = { reflections: false, insights: false, needs: 'account', account: null, invoke: null, outputs: null };
const RealAiContext = createContext<RealAi>(off);

const defaultInvoke = supabase ? supabaseInvoke(supabase) : null;
const defaultOutputs = supabase ? supabaseAiOutputs(supabase) : null;

/** `value` is a test seam that replaces the computed state; the app never passes it. */
type Props = { children: ReactNode; invoke?: Invoke | null; outputs?: AiOutputsRepo | null; value?: RealAi };

export function RealAiProvider({ children, invoke = defaultInvoke, outputs = defaultOutputs, value: fixed }: Props) {
  const { user, mode } = useSession();
  const consent = useAiConsent();
  const computed = useMemo<RealAi>(() => {
    if (!user || !invoke) return { ...off, needs: 'account' };
    if (mode !== 'cloud-sync') return { ...off, needs: 'cloud-sync', account: user.id, outputs };
    return {
      reflections: consent.status('entry_reflection') === 'active',
      insights: consent.status('cross_entry_analysis') === 'active',
      needs: null,
      account: user.id,
      invoke,
      outputs,
    };
  }, [user, mode, consent, invoke, outputs]);
  return <RealAiContext value={fixed ?? computed}>{children}</RealAiContext>;
}

export function useRealAi() {
  return use(RealAiContext);
}
