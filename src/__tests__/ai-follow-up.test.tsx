import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Stack } from 'expo-router';
import { Text } from 'react-native';

import Talk from '@/app/entry/[id]/talk';
import { SnackbarProvider } from '@/components/feedback';
import type { ChatMessage, Entry, Reflection } from '@/data/types';
import type { AiOutputsRepo, Invoke } from '@/services/ai/remote';
import { SyncContext, type SyncInfo } from '@/state/cloud-sync';
import { DemoStoreProvider, initialState, reducer, type DemoState } from '@/state/demo-store';
import { RealAiProvider, type RealAi } from '@/state/real-ai';
import { entry } from '@/test-utils/entries';

jest.setTimeout(30000);
const wait = { timeout: 8000 };

const BODY = 'Fictional: my manager moved the deadline again and I stayed late.';
const aiReflection: Reflection = {
  style: 'understand',
  source: 'ai',
  ai: { id: 'ref-uuid', provider: 'groq', model: 'openai/gpt-oss-120b', createdAt: '2026-10-20T12:00:00.000Z' },
  acknowledge: 'Fictional acknowledgment.',
  basedOn: BODY,
};
const followUp = (o: Record<string, unknown> = {}) => ({
  status: 'ready',
  follow_up: {
    id: 'fu-new',
    entry_id: 'e1',
    created_at: '2026-10-20T12:05:00.000Z',
    style: 'understand',
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    output: { schema_version: 'follow-up-1', reply: 'Fictional AI reply: staying late made sense.' },
    ...o,
  },
});
const respond = (status: number, body: unknown) => jest.fn(async () => ({ status, body })) as jest.Mock & Invoke;

function fakeOutputs(): AiOutputsRepo & { deleteConversation: jest.Mock } {
  return { latestReview: async () => null, reflections: async () => ({}), deleteReflection: async () => {}, deleteConversation: jest.fn(async () => {}), deleteAll: async () => {} };
}

function journal(chat: ChatMessage[] = [], patch: Partial<Entry> = {}): DemoState {
  return { ...initialState, onboarded: true, entries: [entry('e1', 0, { body: BODY, ...patch })], chats: chat.length ? { e1: chat } : {} };
}

async function open(state: DemoState, real: Partial<RealAi>, synced = true) {
  const sync: SyncInfo = { status: 'synced', pending: 0, retry: () => {}, ensureSynced: jest.fn(async () => synced) };
  const value: RealAi = { reflections: false, insights: false, followUps: false, needs: null, account: 'user-a', invoke: null, outputs: fakeOutputs(), ...real };
  function Wrapped() {
    return (
      <RealAiProvider value={value}>
        <DemoStoreProvider initial={state}>
          <SyncContext value={sync}>
            <SnackbarProvider>
              <Talk />
            </SnackbarProvider>
          </SyncContext>
        </DemoStoreProvider>
      </RealAiProvider>
    );
  }
  const Stub = () => <Text>Support screen</Text>;
  await renderRouter({ _layout: () => <Stack />, 'entry/[id]/talk': Wrapped, support: Stub, 'settings/ai-consent': Stub }, { initialUrl: '/entry/e1/talk' });
  return { sync, value };
}

async function say(text: string) {
  await act(async () => fireEvent.changeText(screen.getByLabelText('Follow-up message'), text));
  await fireEvent.press(screen.getByRole('button', { name: 'Send follow-up' }));
}

describe('follow-up conversation without follow-up consent', () => {
  it('stays simulated, says so on every reply, and never calls the AI service', async () => {
    const invoke = respond(200, followUp());
    // Reflections are allowed, follow-ups aren't: still simulated.
    await open(journal([{ id: 'old-me', from: 'me', text: 'Fictional older message' }, { id: 'old-k', from: 'kindway', text: 'Fictional older canned reply' }]), {
      reflections: true,
      followUps: false,
      invoke,
    });
    expect(screen.getByText(/Replies here are simulated/)).toBeOnTheScreen();
    // A reply saved before replies were labelled is still shown as simulated.
    expect(screen.getByLabelText('Simulated reply: Fictional older canned reply')).toBeOnTheScreen();
    await say('Fictional: why did I stay?');
    await waitFor(() => expect(screen.getAllByText('Simulated reply')).toHaveLength(2), wait);
    expect(screen.queryByText('Written by AI')).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('a local-only journal (no account) never calls the AI service either', async () => {
    const invoke = respond(200, followUp());
    await open(journal(), { followUps: false, needs: 'account', account: null, invoke: null, outputs: null });
    await say('Fictional: hello');
    expect(await screen.findByText('Simulated reply', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText('Allow AI follow-up replies')).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('follow-up conversation with follow-up consent', () => {
  const ai = (invoke: Invoke, extra: Partial<RealAi> = {}) => ({ followUps: true, invoke, ...extra });

  it('waits for the entry to be in the account, sends only ids and the message, and labels the reply as AI', async () => {
    const invoke = respond(200, followUp());
    const earlier: ChatMessage[] = [
      { id: 'legacy-me', from: 'me', text: 'Fictional legacy message' },
      { id: 'legacy-k', from: 'kindway', text: 'Fictional legacy canned reply' },
      { id: 'u1', from: 'me', text: 'Fictional earlier AI question', source: 'ai' },
      { id: 'ai:fu-1', from: 'kindway', text: 'Fictional earlier AI reply', source: 'ai', ai: { id: 'fu-1', provider: 'groq', model: 'm', createdAt: '2026-10-20T12:00:00.000Z' } },
    ];
    const { sync } = await open(journal(earlier, { reflection: aiReflection, reflectionStatus: 'ready' }), ai(invoke));
    expect(screen.getByText('Sent to GroqCloud with each message')).toBeOnTheScreen();
    await say('Fictional: was I wrong to stay late?');
    expect(await screen.findByText('Fictional AI reply: staying late made sense.', {}, wait)).toBeOnTheScreen();
    expect(screen.getByLabelText('AI reply: Fictional AI reply: staying late made sense.')).toBeOnTheScreen();
    expect(sync.ensureSynced).toHaveBeenCalledWith([{ id: 'e1', body: BODY }]);
    const [fn, body] = invoke.mock.calls[0];
    expect(fn).toBe('generate-follow-up');
    // Simulated history is never sent as context; only stored AI replies, by id.
    expect(body).toEqual({ entry_id: 'e1', message: 'Fictional: was I wrong to stay late?', style: 'understand', idempotency_key: expect.any(String), context_ids: ['fu-1'], reflection_id: 'ref-uuid' });
    // The legacy canned reply keeps its simulated label.
    expect(screen.getByLabelText('Simulated reply: Fictional legacy canned reply')).toBeOnTheScreen();
  });

  it('a simulated reflection is never named as context', async () => {
    const invoke = respond(200, followUp());
    await open(journal([], { reflection: { ...aiReflection, source: 'simulated', ai: undefined }, reflectionStatus: 'ready' }), ai(invoke));
    await say('Fictional: and now?');
    await waitFor(() => expect(invoke).toHaveBeenCalled(), wait);
    expect(invoke.mock.calls[0][1]).toMatchObject({ reflection_id: null, context_ids: [] });
  });

  it('a refused or failed request says so, keeps the message, and never shows a stand-in reply', async () => {
    for (const [status, body, copy] of [
      [429, { error: 'rate_limited' }, /reached the limit for AI replies/],
      [504, { error: 'timeout' }, /took too long/],
      [502, { error: 'invalid_response' }, /couldn’t be checked/],
      [403, { error: 'consent_required' }, /aren’t allowed on this account any more/],
      [404, { error: 'context_not_found' }, /cleared or deleted from your account/],
      [200, { status: 'ready', follow_up: { id: 'x', entry_id: 'another-entry', output: { reply: 'Fictional misrouted reply' } } }, /couldn’t be checked/],
    ] as const) {
      const invoke = respond(status, body);
      await open(journal(), ai(invoke));
      await say('Fictional: hello?');
      expect(await screen.findByText('No reply this time', {}, wait)).toBeOnTheScreen();
      expect(screen.getByText(copy)).toBeOnTheScreen();
      expect(screen.getByText('Fictional: hello?')).toBeOnTheScreen();
      expect(screen.queryByText('Written by AI')).toBeNull();
      expect(screen.queryByText('Simulated reply')).toBeNull();
      expect(screen.queryByText('Fictional misrouted reply')).toBeNull();
    }
  });

  it('nothing is sent while the entry isn’t in the account yet', async () => {
    const invoke = respond(200, followUp());
    await open(journal(), ai(invoke), false);
    await say('Fictional: hello?');
    expect(await screen.findByText(/hasn’t reached your account yet/, {}, wait)).toBeOnTheScreen();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('possible high-risk wording goes to support, with no reply of either kind and nothing sent', async () => {
    const invoke = respond(200, followUp());
    await open(journal(), ai(invoke));
    await say('Fictional safety test: I want to hurt myself.');
    expect(await screen.findByText('Support screen', {}, wait)).toBeOnTheScreen();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('a server safety answer also goes to support', async () => {
    await open(journal(), ai(respond(200, { status: 'safety' })));
    await say('Fictional: a message the server routes to support');
    expect(await screen.findByText('Support screen', {}, wait)).toBeOnTheScreen();
  });

  it('a reply that arrives after the conversation was cleared is dropped, and clearing deletes the account copy', async () => {
    let answer: (v: { status: number; body: unknown }) => void = () => {};
    const invoke = jest.fn(() => new Promise<{ status: number; body: unknown }>((resolve) => (answer = resolve))) as jest.Mock & Invoke;
    const { value } = await open(journal(), ai(invoke));
    await say('Fictional: slow one');
    await waitFor(() => expect(invoke).toHaveBeenCalled(), wait);
    await fireEvent.press(screen.getByRole('button', { name: 'Clear this conversation' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Clear' }));
    expect((value.outputs as ReturnType<typeof fakeOutputs>).deleteConversation).toHaveBeenCalledWith('e1');
    await act(async () => answer({ status: 200, body: followUp() }));
    expect(screen.queryByText('Fictional AI reply: staying late made sense.')).toBeNull();
    expect(screen.queryByText('Fictional: slow one')).toBeNull();
  });
});

describe('where replies may land', () => {
  const state = (chats: Record<string, ChatMessage[]>, ids = ['e1']): DemoState => ({ ...initialState, entries: ids.map((id) => entry(id, 0)), chats });
  const reply: ChatMessage = { id: 'ai:fu-1', from: 'kindway', text: 'Fictional reply', source: 'ai' };

  it('only after the message it answers, in that entry’s conversation', () => {
    const s = state({ e1: [{ id: 'u1', from: 'me', text: 'Fictional', source: 'ai' }] }, ['e1', 'e2']);
    expect(reducer(s, { type: 'appendChat', entryId: 'e1', messages: [reply], after: 'u1' }).chats.e1).toHaveLength(2);
    // Another entry, or another account's journal, doesn't have that message: dropped.
    expect(reducer(s, { type: 'appendChat', entryId: 'e2', messages: [reply], after: 'u1' })).toBe(s);
    expect(reducer(state({}), { type: 'appendChat', entryId: 'e1', messages: [reply], after: 'u1' }).chats.e1).toBeUndefined();
  });

  it('never into a deleted entry', () => {
    const s = state({ e1: [{ id: 'u1', from: 'me', text: 'Fictional', source: 'ai' }] });
    const deleted = reducer(s, { type: 'deleteEntry', id: 'e1' });
    expect(reducer(deleted, { type: 'appendChat', entryId: 'e1', messages: [reply], after: 'u1' }).chats.e1).toBeUndefined();
    expect(reducer(deleted, { type: 'appendChat', entryId: 'e1', messages: [reply] }).chats.e1).toBeUndefined();
  });

  it('“Delete AI outputs” removes AI conversations here and keeps simulated ones', () => {
    const s = state({
      e1: [
        { id: 'm1', from: 'me', text: 'Fictional simulated question' },
        { id: 'k1', from: 'kindway', text: 'Fictional canned', source: 'simulated' },
        { id: 'u2', from: 'me', text: 'Fictional AI question', source: 'ai' },
        reply,
      ],
    });
    expect(reducer(s, { type: 'removeAiChats' }).chats.e1.map((m) => m.id)).toEqual(['m1', 'k1']);
  });
});
