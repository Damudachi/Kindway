import { Stack } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { useState } from 'react';
import { Text } from 'react-native';

import TopicPage from '@/app/topic/[id]';
import TopicTalk from '@/app/topic/[id]/talk';
import { SnackbarProvider } from '@/components/feedback';
import type { ChatMessage, Topic } from '@/data/types';
import type { AiScope } from '@/services/ai/consent';
import type { AiOutputsRepo, Invoke } from '@/services/ai/remote';
import { AiConsentProvider, type AiConsentInfo } from '@/state/ai-consent';
import { SyncContext, type SyncInfo } from '@/state/cloud-sync';
import { DemoStoreProvider, initialState, reducer, useStore, type DemoState } from '@/state/demo-store';
import { RealAiProvider, type RealAi } from '@/state/real-ai';
import { entry } from '@/test-utils/entries';

jest.setTimeout(30000);
const wait = { timeout: 8000 };

const topic = (patch: Partial<Topic> = {}): Topic => ({ id: 'p1', name: 'Work stress', status: 'open', createdAt: '2026-11-01T09:00:00.000Z', entryIds: ['e1', 'e2'], ...patch });
const ready = (id: string, questions: string[] = []) => ({
  status: 'ready',
  topic_talk: { id, topic_id: 'p1', created_at: '2026-11-17T12:00:00.000Z', style: 'understand', provider: 'groq', model: 'm', output: { schema_version: 'topic-talk-1', reply: `Fictional topic reply ${id}.`, follow_up_questions: questions } },
});
const respond = (body: unknown, status = 200) => jest.fn(async () => ({ status, body })) as jest.Mock & Invoke;
const aiReply = (id: string, questions?: string[]): ChatMessage => ({
  id: `ai:${id}`,
  from: 'kindway',
  text: `Fictional topic reply ${id}.`,
  source: 'ai',
  ai: { id, provider: 'groq', model: 'm', createdAt: '2026-11-17T12:00:00.000Z' },
  ...(questions && { questions }),
});

const journal = (chat: ChatMessage[] = [], topics: Topic[] = [topic()]): DemoState => ({
  ...initialState,
  onboarded: true,
  entries: [entry('e1', 5, { title: 'Older walk' }), entry('e2', 1, { title: 'Newer call' })],
  topics,
  topicChats: chat.length ? { p1: chat } : {},
});

function outputsFake(): AiOutputsRepo & { deleteTopicTalk: jest.Mock } {
  return { latestReview: async () => null, reflections: async () => ({}), deleteReflection: async () => {}, deleteConversation: async () => {}, deleteTopicTalk: jest.fn(async () => {}), deleteAll: async () => {} };
}

/** Shows the topic chat in state, so tests can check what the store holds. */
function Probe() {
  const { state } = useStore();
  return (
    <>
      <Text>{`chat:${(state.topicChats.p1 ?? []).map((m) => m.id).join(',')}`}</Text>
      <Text>{`kept:${state.kept.map((k) => JSON.stringify(k.source)).join(',')}`}</Text>
    </>
  );
}

const say = async (text: string) => {
  await act(async () => fireEvent.changeText(screen.getByLabelText('Topic message'), text));
  await fireEvent.press(screen.getByRole('button', { name: 'Send message' }));
};

async function openAllowed(state: DemoState, invoke = respond(ready('tt-1', ['What would help most?', 'Who could you ask?'])), synced = true) {
  const outputs = outputsFake();
  const ensureSynced = jest.fn(async () => synced);
  const sync: SyncInfo = { status: 'synced', pending: 0, retry: () => {}, refresh: async () => {}, ensureSynced };
  const real: RealAi = { reflections: true, insights: true, followUps: true, needs: null, account: 'user-a', invoke, outputs };
  function Wrapped() {
    return (
      <RealAiProvider value={real}>
        <DemoStoreProvider initial={state}>
          <SyncContext value={sync}>
            <SnackbarProvider>
              <TopicTalk />
              <Probe />
            </SnackbarProvider>
          </SyncContext>
        </DemoStoreProvider>
      </RealAiProvider>
    );
  }
  const Stub = () => <Text>Support screen</Text>;
  await renderRouter({ _layout: () => <Stack />, 'topic/[id]/talk': Wrapped, support: Stub }, { initialUrl: '/topic/p1/talk' });
  return { invoke, outputs, ensureSynced };
}

describe('topic conversation with consent', () => {
  it('shows the notice that matches what is sent', async () => {
    await openAllowed(journal());
    expect(await screen.findByText('Sent to GroqCloud with each message', {}, wait)).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Your message, this topic’s name, up to 8 linked entries from the last 90 days (date, tags, first 600 characters), the last 3 AI replies here, and your support style and challenge settings.',
      ),
    ).toBeOnTheScreen();
  });

  it('syncs the linked entries, sends the request, and shows the reply with question chips', async () => {
    const { invoke, ensureSynced } = await openAllowed(journal());
    await say('Fictional: what keeps coming up?');
    expect(await screen.findByText('Fictional topic reply tt-1.', {}, wait)).toBeOnTheScreen();
    const synced = (ensureSynced.mock.calls[0] as unknown as [{ id: string }[]])[0].map((e) => e.id).sort();
    expect(synced).toEqual(['e1', 'e2']);
    const body = (invoke.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(invoke.mock.calls[0][0]).toBe('generate-topic-talk');
    expect(body).toMatchObject({ topic_id: 'p1', message: 'Fictional: what keeps coming up?', style: 'understand', context_ids: [] });
    expect(body.tz_offset_minutes).toBe(Math.round(-new Date().getTimezoneOffset()));
    expect(typeof body.idempotency_key).toBe('string');
    expect(screen.getByLabelText('You: Fictional: what keeps coming up?')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'What would help most?' })).toBeOnTheScreen();
  });

  it('mints a new idempotency key per send and passes earlier AI replies as context', async () => {
    let n = 0;
    const each = jest.fn(async () => ({ status: 200, body: ready(`tt-${++n}`) })) as jest.Mock & Invoke;
    const { invoke } = await openAllowed(journal([aiReply('tt-0')]), each);
    await say('Fictional: first');
    await screen.findByText('Fictional topic reply tt-1.', {}, wait);
    await say('Fictional: second');
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2), wait);
    const [a, b] = invoke.mock.calls.map((c) => (c as unknown[])[1] as Record<string, unknown>);
    expect(a.context_ids).toEqual(['tt-0']);
    expect(b.context_ids).toEqual(['tt-0', 'tt-1']);
    expect(a.idempotency_key).not.toBe(b.idempotency_key);
  });

  it('a chip posts the question as a Kindway bubble and the answer is sent with it as asked', async () => {
    let n = 0;
    const each = jest.fn(async () => ({ status: 200, body: ready(`tt-${++n}`) })) as jest.Mock & Invoke;
    const { invoke } = await openAllowed(journal([aiReply('tt-0', ['What would help most?'])]), each);
    await fireEvent.press(await screen.findByRole('button', { name: 'What would help most?' }, wait));
    expect(await screen.findByLabelText('Kindway asked: What would help most?', {}, wait)).toBeOnTheScreen();
    await say('Fictional: a quiet evening');
    await screen.findByText('Fictional topic reply tt-1.', {}, wait);
    expect((invoke.mock.calls[0] as unknown[])[1]).toMatchObject({ message: 'Fictional: a quiet evening', asked: 'What would help most?' });
    await say('Fictional: and more');
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2), wait);
    expect((invoke.mock.calls[1] as unknown[])[1]).not.toHaveProperty('asked');
  });

  it('keeps the question for the retry when the send fails', async () => {
    const invoke = jest
      .fn()
      .mockResolvedValueOnce({ status: 500, body: { error: 'server_error' } })
      .mockResolvedValueOnce({ status: 200, body: ready('tt-1') }) as jest.Mock & Invoke;
    await openAllowed(journal([aiReply('tt-0', ['What would help most?'])]), invoke);
    await fireEvent.press(await screen.findByRole('button', { name: 'What would help most?' }, wait));
    await say('Fictional: a quiet evening');
    expect(await screen.findByText(/The AI service couldn’t be reached/, {}, wait)).toBeOnTheScreen();
    await say('Fictional: a quiet evening');
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2), wait);
    expect((invoke.mock.calls[1] as unknown[])[1]).toMatchObject({ asked: 'What would help most?' });
  });

  it('says so when the topic or its entries are not on the account, and sends nothing', async () => {
    const { invoke } = await openAllowed(journal(), respond(ready('tt-1')), false);
    await say('Fictional: hello');
    expect(await screen.findByText(/haven’t reached your account yet/, {}, wait)).toBeOnTheScreen();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('maps a topic the server does not have to the same state', async () => {
    await openAllowed(journal(), respond({ error: 'topic_not_found' }, 404));
    await say('Fictional: hello');
    expect(await screen.findByText(/haven’t reached your account yet/, {}, wait)).toBeOnTheScreen();
  });

  it('sends high-risk wording to support and never to the AI', async () => {
    const { invoke } = await openAllowed(journal());
    await say('I want to kill myself');
    expect(await screen.findByText('Support screen', {}, wait)).toBeOnTheScreen();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('keeps an AI reply as words from the topic', async () => {
    await openAllowed(journal([aiReply('tt-0')]));
    await fireEvent.press(await screen.findByRole('button', { name: 'Keep these words' }, wait));
    expect(await screen.findByRole('button', { name: 'Kept. Tap to remove' }, wait)).toBeOnTheScreen();
    expect(screen.getByText('kept:{"kind":"topic","topicId":"p1"}')).toBeOnTheScreen();
  });

  it('Clear removes the conversation here and deletes it from the account', async () => {
    const { outputs } = await openAllowed(journal([aiReply('tt-0')]));
    expect(await screen.findByText('chat:ai:tt-0', {}, wait)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Clear this conversation' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Clear' }, wait));
    expect(await screen.findByText('chat:', {}, wait)).toBeOnTheScreen();
    expect(outputs.deleteTopicTalk).toHaveBeenCalledWith('p1');
  });

  it('Clear on a chat with no AI replies makes no account call', async () => {
    const asked: ChatMessage = { id: 'q1', from: 'kindway', text: 'Fictional question?', source: 'ai', asked: true };
    const { outputs } = await openAllowed(journal([asked]));
    await fireEvent.press(await screen.findByRole('button', { name: 'Clear this conversation' }, wait));
    await fireEvent.press(await screen.findByRole('button', { name: 'Clear' }, wait));
    expect(await screen.findByText('chat:', {}, wait)).toBeOnTheScreen();
    expect(outputs.deleteTopicTalk).not.toHaveBeenCalled();
  });
});

describe('topic conversation without cross-entry consent', () => {
  async function openAsking(grantResult = true) {
    const invoke = respond(ready('tt-1'));
    const grant = jest.fn(async (_scope: AiScope) => grantResult);
    const sync: SyncInfo = { status: 'synced', pending: 0, retry: () => {}, refresh: async () => {}, ensureSynced: jest.fn(async () => true) };
    function Wrapped() {
      const [allowed, setAllowed] = useState(false);
      const consent: AiConsentInfo = {
        load: 'ready',
        records: [],
        status: () => (allowed ? 'active' : 'none'),
        grant: async (scope) => {
          const ok = await grant(scope);
          if (ok) setAllowed(true);
          return ok;
        },
        revoke: async () => false,
        reload: () => {},
      };
      const real: RealAi = { reflections: true, insights: allowed, followUps: true, needs: null, account: 'user-a', invoke, outputs: outputsFake() };
      return (
        <AiConsentProvider value={consent}>
          <RealAiProvider value={real}>
            <DemoStoreProvider initial={journal()}>
              <SyncContext value={sync}>
                <SnackbarProvider>
                  <TopicTalk />
                </SnackbarProvider>
              </SyncContext>
            </DemoStoreProvider>
          </RealAiProvider>
        </AiConsentProvider>
      );
    }
    await renderRouter({ _layout: () => <Stack />, 'topic/[id]/talk': Wrapped }, { initialUrl: '/topic/p1/talk' });
    return { invoke, grant };
  }

  it('opens the cross-entry consent dialog and sends nothing until it is given', async () => {
    const { invoke, grant } = await openAsking();
    await say('Fictional: hello');
    expect(await screen.findByText('Allow AI for topic conversations?', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText(/Sending a message here sends it to GroqCloud with this topic’s name and some of its linked entries\. The same permission covers AI reviews across entries\. Nothing is sent until you allow it\./)).toBeOnTheScreen();
    expect(screen.getByText('What would be sent')).toBeOnTheScreen();
    expect(screen.queryByText('Allow AI reviews?')).toBeNull();
    expect(screen.queryByLabelText('You: Fictional: hello')).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText(/I’ve read what would be sent/));
    await fireEvent.press(screen.getByRole('button', { name: 'Allow and send' }));
    expect(grant).toHaveBeenCalledWith('cross_entry_analysis');
    expect(await screen.findByText('Fictional topic reply tt-1.', {}, wait)).toBeOnTheScreen();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][1]).toMatchObject({ topic_id: 'p1', message: 'Fictional: hello' });
  });

  it('cancelling keeps the message and sends nothing', async () => {
    const { invoke, grant } = await openAsking();
    await say('Fictional: hello');
    await fireEvent.press(await screen.findByRole('button', { name: 'Cancel' }, wait));
    await waitFor(() => expect(screen.queryByText('Allow AI for topic conversations?')).toBeNull(), wait);
    expect(screen.getByLabelText('Topic message').props.value).toBe('Fictional: hello');
    expect(grant).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('topic page', () => {
  it('offers Talk about this', async () => {
    const Stub = () => <Text>talk screen</Text>;
    function Layout() {
      return (
        <DemoStoreProvider initial={journal()}>
          <Stack />
        </DemoStoreProvider>
      );
    }
    await renderRouter({ _layout: Layout, 'topic/[id]': TopicPage, 'topic/[id]/talk': Stub, 'entry/[id]/index': Stub }, { initialUrl: '/topic/p1' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Talk about this' }, wait));
    expect(await screen.findByText('talk screen', {}, wait)).toBeOnTheScreen();
  });
});

describe('topicChats in the store', () => {
  const chat = [aiReply('tt-0')];
  const base = journal(chat);

  it('deleting a topic clears its conversation', () => {
    const next = reducer(base, { type: 'deleteTopic', id: 'p1' });
    expect(next.topicChats.p1).toBeUndefined();
  });

  it('appends only to a topic that exists, and a late reply only after its message', () => {
    const msg = aiReply('tt-9');
    expect(reducer(base, { type: 'appendTopicChat', topicId: 'gone', messages: [msg] })).toBe(base);
    expect(reducer(base, { type: 'appendTopicChat', topicId: 'p1', messages: [msg], after: 'missing' })).toBe(base);
    expect(reducer(base, { type: 'appendTopicChat', topicId: 'p1', messages: [msg], after: 'ai:tt-0' }).topicChats.p1.map((m) => m.id)).toEqual(['ai:tt-0', 'ai:tt-9']);
  });

  it('removing AI chats also removes AI topic replies', () => {
    const withMine = reducer(base, { type: 'topicChat', topicId: 'p1', messages: [{ id: 'm1', from: 'me', text: 'x', source: 'simulated' }, ...chat] });
    expect(reducer(withMine, { type: 'removeAiChats' }).topicChats.p1.map((m) => m.id)).toEqual(['m1']);
  });
});
