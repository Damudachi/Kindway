import type { DemoAi } from '@/data/types';

import { mockFollowUp } from './mock-follow-up';
import { mockReflection } from './mock-reflection';
import type { AiError, AiService } from './types';

export type * from './types';

export const SIMULATED_ERRORS: Record<Exclude<DemoAi, 'ok'>, AiError> = { fail: 'failed', rate: 'rate', offline: 'offline' };

/**
 * Local stand-in for the AI backend. `simulate` comes from Settings → Preview states so reviewers
 * can see failures; a real service would ignore it. Nothing leaves the device.
 */
export function createMockAiService({ simulate = 'ok', latencyMs = 1400 }: { simulate?: DemoAi; latencyMs?: number } = {}): AiService {
  const wait = () => new Promise<void>((resolve) => setTimeout(resolve, latencyMs));
  return {
    async reflect(req) {
      await wait();
      return simulate === 'ok' ? { ok: true, reflection: mockReflection(req) } : { ok: false, error: SIMULATED_ERRORS[simulate] };
    },
    async followUp(req) {
      await wait();
      return simulate === 'ok' ? { ok: true, message: mockFollowUp(req) } : { ok: false, error: SIMULATED_ERRORS[simulate] };
    },
  };
}

/** The simulated service. Real AI goes through remote.ts, chosen in state/actions.ts only when the user allowed it. */
export function getAiService(simulate: DemoAi): AiService {
  return createMockAiService({ simulate });
}
