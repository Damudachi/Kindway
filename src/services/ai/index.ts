import type { DemoAi } from '@/data/types';

import { mockReflection } from './mock-reflection';
import { mockWeeklyReview } from './mock-weekly';
import type { AiError, AiService } from './types';

export type * from './types';

const ERRORS: Record<Exclude<DemoAi, 'ok'>, AiError> = { fail: 'failed', rate: 'rate', offline: 'offline' };

/**
 * Local stand-in for the AI backend. `simulate` comes from Settings → Preview states so reviewers
 * can see failures; a real service would ignore it. Nothing leaves the device.
 */
export function createMockAiService({ simulate = 'ok', latencyMs = 1400 }: { simulate?: DemoAi; latencyMs?: number } = {}): AiService {
  const wait = () => new Promise<void>((resolve) => setTimeout(resolve, latencyMs));
  return {
    async reflect(req) {
      await wait();
      return simulate === 'ok' ? { ok: true, reflection: mockReflection(req) } : { ok: false, error: ERRORS[simulate] };
    },
    async weeklyReview(req) {
      await wait();
      return simulate === 'ok' ? mockWeeklyReview(req) : { status: 'error', error: ERRORS[simulate] };
    },
  };
}

/** The one place the app gets its AI service. TODO(ai): return the Edge Function client here. */
export function getAiService(simulate: DemoAi): AiService {
  return createMockAiService({ simulate });
}
