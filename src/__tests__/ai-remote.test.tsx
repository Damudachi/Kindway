import { router, Stack } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { useState } from 'react';
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

function fakeOutputs(): AiOutputsRepo & { latestReview: jest.Mock; deleteReflection: jest.Mock; deleteConversation: jest.Mock; deleteAll: jest.Mock } {
  return { latestReview: jest.fn(async () => null), reflections: jest.fn(async () => ({})), deleteReflection: jest.fn(async () => {}), deleteConversation: jest.fn(async () => {}), deleteAll: jest.fn(async () => {}) };
}

async function render(path: string, Screen: () => React.ReactElement, state: DemoState, real: Partial<RealAi>, synced = true) {
  const sync: SyncInfo = { status: 'synced', pending: 0, retry: () => {}, ensureSynced: jest.fn(async () => synced) };
  const value: RealAi = { reflections: false, insights: false, followUps: false, needs: null, account: 'user-a', invoke: null, outputs: fakeOutputs(), ...real };
  let setReal: (v: RealAi) => void = () => {};
  function Wrapped() {
    const [current, set] = useState(value);
    setReal = set;
    return (
      <RealAiProvider value={current}>
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
  // A stack, as in the app, so a screen stays mounted under the one pushed over it.
  await renderRouter({ _layout: () => <Stack />, [path]: Wrapped, support: Stub, 'settings/ai-consent': Stub }, { initialUrl: path.replace('[id]', 'e1') });
  return {
    sync,
    value,
    /** What the session would change: another account signing in, or signing out. */
    switchTo: (patch: Partial<RealAi>) => act(async () => setReal({ ...value, ...patch })),
  };
}

/** Opens another screen over the current one and comes back, as after visiting settings. */
async function visitSettingsAndReturn() {
  await act(async () => router.push('/settings/ai-consent'));
  await screen.findByText('Support screen', {}, wait);
  await act(async () => router.back());
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

  const stored = (o: Record<string, unknown> = {}) => toReview({ ...storedInsight, ...o });
  const open = (outputs: ReturnType<typeof fakeOutputs>, real: Partial<RealAi> = {}, entries = week(3)) =>
    render('patterns', Patterns, { ...initialState, onboarded: true, entries }, { insights: true, invoke: respond(200, {}), outputs, ...real });

  it('restores the account’s saved review, including on a device that didn’t write it', async () => {
    const outputs = fakeOutputs();
    outputs.latestReview.mockResolvedValue(stored());
    await open(outputs);
    expect(await screen.findByText('A tiring week with a calmer end.', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText(/^Your last AI review,/)).toBeOnTheScreen();
    expect(outputs.latestReview).toHaveBeenCalledWith('week');
  });

  it('says when it is still looking, and when there is genuinely no saved review', async () => {
    const outputs = fakeOutputs();
    let answer: (r: null) => void = () => {};
    outputs.latestReview.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    await open(outputs);
    expect(await screen.findByText('Looking for your saved AI review…', {}, wait)).toBeOnTheScreen();
    await act(async () => answer(null));
    expect(await screen.findByText('No saved AI review for this week yet.', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText('Your saved AI review couldn’t be loaded')).toBeNull();
  });

  it('a failed read is not shown as “no review”, and can be retried', async () => {
    const outputs = fakeOutputs();
    outputs.latestReview.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(stored());
    await open(outputs);
    expect(await screen.findByText('Your saved AI review couldn’t be loaded', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText(/There may be one in your account/)).toBeOnTheScreen();
    expect(screen.queryByText(/No saved AI review/)).toBeNull();
    // The entries that would be sent stay available.
    expect(screen.getByText('3 entries would be sent')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try loading it again' }));
    expect(await screen.findByText('A tiring week with a calmer end.', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText('Your saved AI review couldn’t be loaded')).toBeNull();
  });

  it('a review deleted from the account disappears when Patterns is shown again', async () => {
    const outputs = fakeOutputs();
    outputs.latestReview.mockResolvedValueOnce(stored()).mockResolvedValue(null);
    await open(outputs);
    expect(await screen.findByText('A tiring week with a calmer end.', {}, wait)).toBeOnTheScreen();
    // E.g. "Delete AI outputs" in settings, then back to Patterns.
    await visitSettingsAndReturn();
    expect(await screen.findByText('No saved AI review for this week yet.', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText('A tiring week with a calmer end.')).toBeNull();
  });

  it('reading the same record again shows it once, and a review written here keeps its label', async () => {
    const outputs = fakeOutputs();
    outputs.latestReview.mockResolvedValueOnce(null).mockResolvedValue(stored());
    await open(outputs, { invoke: respond(200, { status: 'ready', insight: storedInsight }) });
    await fireEvent.press(await screen.findByRole('button', { name: 'Send 3 entries for an AI review' }));
    expect(await screen.findByText('Written by AI', {}, wait)).toBeOnTheScreen();
    await visitSettingsAndReturn();
    await visitSettingsAndReturn();
    await waitFor(() => expect(outputs.latestReview).toHaveBeenCalledTimes(3), wait);
    expect(screen.getByText('Written by AI')).toBeOnTheScreen();
    expect(screen.getAllByText('A tiring week with a calmer end.')).toHaveLength(1);
  });

  it('account A’s review is gone the moment B signs in or A signs out, and comes back for A only', async () => {
    const a = fakeOutputs();
    a.latestReview.mockResolvedValue(stored());
    const b = fakeOutputs();
    let answerB: (r: null) => void = () => {};
    b.latestReview.mockReturnValue(new Promise((resolve) => (answerB = resolve)));
    const t = await open(a);
    expect(await screen.findByText('A tiring week with a calmer end.', {}, wait)).toBeOnTheScreen();

    // B's read hasn't answered yet, and A's review is already gone.
    await t.switchTo({ account: 'user-b', outputs: b });
    expect(screen.queryByText('A tiring week with a calmer end.')).toBeNull();
    expect(screen.getByText('Looking for your saved AI review…')).toBeOnTheScreen();
    await act(async () => answerB(null));
    expect(await screen.findByText('No saved AI review for this week yet.', {}, wait)).toBeOnTheScreen();

    await t.switchTo({ account: null, insights: false, needs: 'account', invoke: null, outputs: null });
    expect(screen.queryByText('A tiring week with a calmer end.')).toBeNull();
    expect(screen.getByText(/It needs an account with cloud backup/)).toBeOnTheScreen();

    await t.switchTo({ account: 'user-a', outputs: a });
    expect(await screen.findByText('A tiring week with a calmer end.', {}, wait)).toBeOnTheScreen();
  });

  it('local-only and signed in without cloud backup never read saved reviews', async () => {
    const outputs = fakeOutputs();
    outputs.latestReview.mockResolvedValue(stored());
    const t = await open(outputs, { insights: false, needs: 'account', account: null });
    expect(await screen.findByText(/It needs an account with cloud backup/)).toBeOnTheScreen();
    await t.switchTo({ insights: false, needs: 'cloud-sync', account: 'user-a', outputs });
    expect(await screen.findByText(/so it needs cloud backup on this device/)).toBeOnTheScreen();
    expect(outputs.latestReview).not.toHaveBeenCalled();
    expect(screen.queryByText('A tiring week with a calmer end.')).toBeNull();
  });

  it('a refused or failed request never looks like a review, and nothing simulated stands in', async () => {
    const outputs = fakeOutputs();
    await open(outputs, { invoke: respond(429, { error: 'rate_limited' }) });
    await fireEvent.press(await screen.findByRole('button', { name: 'Send 3 entries for an AI review' }));
    expect(await screen.findByText('AI reviews are paused for a little while', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText(/Written by/)).toBeNull();
    expect(screen.queryByText(/Your last AI review/)).toBeNull();
    expect(screen.queryByText(/Sample/)).toBeNull();
  });

  it('links only to sources that are still in this journal; a point whose sources are all gone is not shown', async () => {
    const outputs = fakeOutputs();
    outputs.latestReview.mockResolvedValue(stored());
    // w3, the only source of "Finding calm" and of the suggested step, was deleted.
    await open(outputs, {}, week(2));
    expect(await screen.findByText('A tiring week with a calmer end.', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText('Finding calm')).toBeNull();
    expect(screen.queryByText('Maybe another short walk.')).toBeNull();
    // A source the server didn't record for this review is never a link, even if it exists here.
    expect(screen.queryByText('Unknown source')).toBeNull();
  });

  it('feedback stays with the review record it was given on', async () => {
    const outputs = fakeOutputs();
    outputs.latestReview.mockResolvedValueOnce(stored()).mockResolvedValue(stored({ id: 'ins-2' }));
    await open(outputs);
    expect(await screen.findByText('Finding calm', {}, wait)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Fits' }));
    expect(screen.getByRole('checkbox', { name: 'Fits', checked: true })).toBeOnTheScreen();
    // A newer review (another record) replaces it: same wording, no carried-over feedback.
    await visitSettingsAndReturn();
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Fits', checked: false })).toBeOnTheScreen(), wait);
  });

  it('over the limit, it explains instead of trimming, and offers no send button', async () => {
    await render('patterns', Patterns, { ...initialState, onboarded: true, entries: week(21) }, { insights: true, invoke: respond(200, {}) });
    expect(await screen.findByText('Too much for one review')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Send \d+ entries/ })).toBeNull();
  });
});
