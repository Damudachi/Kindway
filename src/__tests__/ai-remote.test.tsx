import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';

import Patterns from '@/app/(tabs)/patterns';
import EntryDetail from '@/app/entry/[id]/index';
import { SnackbarProvider } from '@/components/feedback';
import type { Entry } from '@/data/types';
import { requestAiReflection, requestAiReview, toReview, type AiOutputsRepo, type Invoke } from '@/services/ai/remote';
import { SyncContext, type SyncInfo } from '@/state/cloud-sync';
import { DemoStoreProvider, initialState, type DemoState } from '@/state/demo-store';
import { RealAiProvider, type RealAi } from '@/state/real-ai';
import { entry } from '@/test-utils/entries';

jest.setTimeout(30000);
const wait = { timeout: 8000 };

const storedReflection = (o: Record<string, unknown> = {}) => ({
  id: 'ref-1',
  entry_id: 'e1',
  created_at: '2026-10-20T12:00:00.000Z',
  style: 'understand',
  provider: 'groq',
  model: 'openai/gpt-oss-120b',
  output: {
    schema_version: 'reflection-1',
    acknowledgment: 'A long day, and you kept going.',
    events_and_interpretations: null,
    possible_perspective: 'One possibility is the deadline was about planning, not you.',
    compass_connection: null,
    suggested_step: null,
    reflection_question: null,
    safety_guidance: null,
    ...o,
  },
});

const storedInsight = {
  id: 'ins-1',
  created_at: '2026-10-20T12:00:00.000Z',
  period: 'week',
  entry_count: 3,
  provider: 'groq',
  model: 'openai/gpt-oss-120b',
  output: {
    schema_version: 'insights-1',
    enough_evidence: true,
    summary: 'A tiring week with a calmer end.',
    observations: [
      { kind: 'strength', title: 'Finding calm', body: 'A walk seemed to help.', grounding: 'observed', entry_ids: ['w3'] },
      { kind: 'theme', title: 'Unknown source', body: 'b', grounding: 'interpretation', entry_ids: ['not-sent'] },
    ],
    next_steps: [{ text: 'Maybe another short walk.', why: 'It helped once.', entry_ids: ['w3'] }],
  },
  sources: ['w1', 'w2', 'w3'].map((id) => ({ entry_id: id, written_at: '2026-10-19T20:00:00.000Z' })),
};

const respond = (status: number, body: unknown): Invoke => jest.fn(async () => ({ status, body }));

describe('remote AI client', () => {
  it('sends only the entry id, style and a fresh idempotency key', async () => {
    const invoke = respond(200, { status: 'ready', reflection: storedReflection() });
    const result = await requestAiReflection(invoke, { id: 'e1', body: 'Fictional text' }, 'understand');
    expect(result).toMatchObject({ ok: true, reflection: { source: 'ai', acknowledge: 'A long day, and you kept going.', ai: { model: 'openai/gpt-oss-120b' }, basedOn: 'Fictional text' } });
    const [fn, body] = (invoke as jest.Mock).mock.calls[0];
    expect(fn).toBe('generate-reflection');
    expect(Object.keys(body).sort()).toEqual(['entry_id', 'idempotency_key', 'style']);
    expect(body.idempotency_key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it.each([
    [403, 'consent_required', 'consent'],
    [404, 'entry_not_found', 'not-synced'],
    [413, 'entry_too_long', 'too-long'],
    [429, 'rate_limited', 'rate'],
    [503, 'provider_busy', 'rate'],
    [409, 'busy', 'busy'],
    [504, 'timeout', 'timeout'],
    [502, 'invalid_response', 'invalid'],
    [503, 'provider_unavailable', 'unavailable'],
    [500, 'something_new', 'failed'],
  ])('maps %i %s to the “%s” state', async (status, error, state) => {
    expect(await requestAiReflection(respond(status, { error }), { id: 'e1', body: 'x' }, 'listen')).toEqual({ ok: false, error: state });
  });

  it('reports offline, the safety route, and an unusable reply as such, never as a reflection', async () => {
    expect(await requestAiReflection(jest.fn(async () => 'offline' as const), { id: 'e1', body: 'x' }, 'listen')).toEqual({ ok: false, error: 'offline' });
    expect(await requestAiReflection(respond(200, { status: 'safety' }), { id: 'e1', body: 'x' }, 'listen')).toEqual({ ok: false, error: 'safety' });
    expect(await requestAiReflection(respond(200, { status: 'ready', reflection: storedReflection({ acknowledgment: '' }) }), { id: 'e1', body: 'x' }, 'listen')).toEqual({
      ok: false,
      error: 'invalid',
    });
  });

  it('a review keeps only sources that were sent, and links each point to them', () => {
    const review = toReview(storedInsight)!;
    expect(review.basis).toBe('ai');
    expect(review.strengths.map((i) => i.sources.map((s) => s.id))).toEqual([['w3']]);
    expect(review.themes).toEqual([]);
    expect(review.actions).toHaveLength(1);
    expect(review.strengths[0].grounding).toBe('observed');
  });

  it('a review states the server’s limits when it refuses', async () => {
    expect(await requestAiReview(respond(413, { error: 'too_many_entries', max_entries: 20 }), 'week', ['a'])).toEqual({ status: 'error', error: 'too-many', limit: 20 });
    expect(await requestAiReview(respond(409, { error: 'selection_changed' }), 'week', ['a'])).toEqual({ status: 'error', error: 'selection-changed' });
  });
});

// Screens ---------------------------------------------------------------------------------

function fakeOutputs(): AiOutputsRepo & { deleteReflection: jest.Mock; deleteAll: jest.Mock } {
  return { latestReview: jest.fn(async () => null), deleteReflection: jest.fn(async () => {}), deleteAll: jest.fn(async () => {}) };
}

async function render(path: string, Screen: () => React.ReactElement, state: DemoState, real: Partial<RealAi>, synced = true) {
  const sync: SyncInfo = { status: 'synced', pending: 0, retry: () => {}, ensureSynced: jest.fn(async () => synced) };
  const value: RealAi = { reflections: false, insights: false, needs: null, invoke: null, outputs: fakeOutputs(), ...real };
  function Wrapped() {
    return (
      <RealAiProvider value={value}>
        <DemoStoreProvider initial={state}>
          <SyncContext value={sync}>
            <SnackbarProvider>
              <Screen />
            </SnackbarProvider>
          </SyncContext>
        </DemoStoreProvider>
      </RealAiProvider>
    );
  }
  const Stub = () => <Text>Support screen</Text>;
  await renderRouter({ [path]: Wrapped, support: Stub, 'settings/ai-consent': Stub }, { initialUrl: path.replace('[id]', 'e1') });
  return { sync, value };
}

const withEntry = (patch: Partial<Entry> = {}, state: Partial<DemoState> = {}): DemoState => ({
  ...initialState,
  onboarded: true,
  aiConsent: 'journal-only',
  entries: [entry('e1', 0, { body: 'Fictional: the deadline moved again.', ...patch })],
  ...state,
});

describe('a real AI reflection on an entry', () => {
  it('waits for cloud backup, asks the server, and labels the result as written by AI', async () => {
    const invoke = respond(200, { status: 'ready', reflection: storedReflection() });
    const { sync } = await render('entry/[id]', EntryDetail, withEntry(), { reflections: true, invoke });
    await fireEvent.press(await screen.findByRole('button', { name: 'Reflect on this entry with AI' }));
    expect(await screen.findByText('A long day, and you kept going.', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText(/Written by AI \(openai\/gpt-oss-120b on GroqCloud\)/)).toBeOnTheScreen();
    expect(screen.queryByText(/simulated/)).toBeNull();
    expect(sync.ensureSynced).toHaveBeenCalledWith([{ id: 'e1', body: 'Fictional: the deadline moved again.' }]);
    expect((invoke as jest.Mock).mock.calls[0][1]).toMatchObject({ entry_id: 'e1' });
  });

  it('sends nothing until the entry has reached the account', async () => {
    const invoke = respond(200, { status: 'ready', reflection: storedReflection() });
    await render('entry/[id]', EntryDetail, withEntry(), { reflections: true, invoke }, false);
    await fireEvent.press(await screen.findByRole('button', { name: 'Reflect on this entry with AI' }));
    expect(await screen.findByText('Your entry hasn’t reached your account yet', {}, wait)).toBeOnTheScreen();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('a failure is shown as a failure; a simulated preview only on request, and labelled', async () => {
    await render('entry/[id]', EntryDetail, withEntry({}, { aiConsent: 'ai' }), { reflections: true, invoke: respond(504, { error: 'timeout' }) });
    await fireEvent.press(await screen.findByRole('button', { name: 'Reflect on this entry with AI' }));
    expect(await screen.findByText('The AI took too long to answer', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText(/Written by AI/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Use a simulated preview instead' }));
    expect(await screen.findByText(/Preview response · simulated/, {}, wait)).toBeOnTheScreen();
  });

  it('when consent is missing on the server, it says so and points to the setting', async () => {
    await render('entry/[id]', EntryDetail, withEntry(), { reflections: true, invoke: respond(403, { error: 'consent_required' }) });
    await fireEvent.press(await screen.findByRole('button', { name: 'Reflect on this entry with AI' }));
    expect(await screen.findByText('AI reflections aren’t allowed on this account', {}, wait)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'AI processing settings' }));
    expect(await screen.findByText('Support screen')).toBeOnTheScreen();
  });

  it('the safety route opens Extra support instead of showing anything from the model', async () => {
    await render('entry/[id]', EntryDetail, withEntry(), { reflections: true, invoke: respond(200, { status: 'safety' }) });
    await fireEvent.press(await screen.findByRole('button', { name: 'Reflect on this entry with AI' }));
    expect(await screen.findByText('Support screen', {}, wait)).toBeOnTheScreen();
  });

  it('removing an AI reflection also deletes it from the account', async () => {
    const outputs = fakeOutputs();
    const reflection = { style: 'understand' as const, source: 'ai' as const, ai: { id: 'ref-9', provider: 'groq', model: 'openai/gpt-oss-120b', createdAt: '' }, acknowledge: 'Stored.', basedOn: 'Fictional: the deadline moved again.' };
    await render('entry/[id]', EntryDetail, withEntry({ reflection, reflectionStatus: 'ready' }), { reflections: true, invoke: respond(500, {}), outputs });
    await fireEvent.press(await screen.findByRole('button', { name: 'Remove this reflection' }));
    await waitFor(() => expect(outputs.deleteReflection).toHaveBeenCalledWith('ref-9'));
    expect(await screen.findByText(/deleted from this device and your account/)).toBeOnTheScreen();
  });
});

describe('the AI review in Patterns', () => {
  const week = (n: number) => Array.from({ length: n }, (_, i) => entry(`w${i + 1}`, i % 3, { body: `Fictional entry ${i + 1}.`, feelings: ['Tired'] }));

  it('without permission, it explains and sends nothing', async () => {
    const invoke = respond(200, {});
    await render('patterns', Patterns, { ...initialState, onboarded: true, entries: week(3) }, { insights: false, invoke });
    expect(await screen.findByText(/It needs its own permission, separate from reflections/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Send \d+ entries/ })).toBeNull();
  });

  it('lists what would be sent, sends exactly those ids, and labels the review as AI', async () => {
    const invoke = respond(200, { status: 'ready', insight: storedInsight });
    await render('patterns', Patterns, { ...initialState, onboarded: true, entries: week(3) }, { insights: true, invoke });
    expect(await screen.findByText('3 entries would be sent')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Send 3 entries for an AI review' }));
    expect(await screen.findByText('A tiring week with a calmer end.', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText(/Written by openai\/gpt-oss-120b on GroqCloud from the 3 entries/)).toBeOnTheScreen();
    expect(screen.getByText('Seen in what you wrote or tagged')).toBeOnTheScreen();
    const body = (invoke as jest.Mock).mock.calls[0][1];
    expect(body).toMatchObject({ period: 'week' });
    expect([...body.entry_ids].sort()).toEqual(['w1', 'w2', 'w3']);
  });

  it('over the limit, it explains instead of trimming, and offers no send button', async () => {
    await render('patterns', Patterns, { ...initialState, onboarded: true, entries: week(21) }, { insights: true, invoke: respond(200, {}) });
    expect(await screen.findByText('Too much for one review')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Send \d+ entries/ })).toBeNull();
  });
});
