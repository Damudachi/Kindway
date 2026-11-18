import { Stack } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import EntryDetail from '@/app/entry/[id]/index';
import Talk from '@/app/entry/[id]/talk';
import { SnackbarProvider } from '@/components/feedback';
import { AiConsentProvider, type AiConsentInfo } from '@/state/ai-consent';
import { useState } from 'react';
import type { ChatMessage, Entry, Reflection } from '@/data/types';
import type { Invoke } from '@/services/ai/remote';
import { SyncContext, type SyncInfo } from '@/state/cloud-sync';
import { DemoStoreProvider, initialState, type DemoState } from '@/state/demo-store';
import { RealAiProvider, type RealAi } from '@/state/real-ai';
import { entry } from '@/test-utils/entries';

jest.setTimeout(30000);
const wait = { timeout: 8000 };

const BODY = 'Fictional: work ran late again and then my sister called about the move.';
const QUESTIONS = ['What made Tuesday feel lighter?', 'What do you hope the move changes?', 'Who helped most this week?'];
const aiReflection = (patch: Partial<Reflection> = {}): Reflection => ({
  style: 'understand',
  source: 'ai',
  ai: { id: 'ref-1', provider: 'groq', model: 'openai/gpt-oss-120b', createdAt: '2026-10-25T12:00:00.000Z' },
  acknowledge: 'Fictional acknowledgment.',
  basedOn: BODY,
  followUpQuestions: QUESTIONS,
  ...patch,
});
const reply = (id: string, questions?: string[]): ChatMessage => ({
  id: `ai:${id}`,
  from: 'kindway',
  text: `Fictional reply ${id}`,
  source: 'ai',
  ai: { id, provider: 'groq', model: 'm', createdAt: '2026-10-25T12:00:00.000Z' },
  ...(questions && { questions }),
});
const answer = () =>
  jest.fn(async () => ({
    status: 200,
    body: {
      status: 'ready',
      follow_up: { id: 'fu-new', entry_id: 'e1', created_at: '2026-10-25T12:05:00.000Z', style: 'understand', provider: 'groq', model: 'm', output: { schema_version: 'follow-up-1', reply: 'Fictional AI answer.' } },
    },
  })) as jest.Mock & Invoke;

const journal = (patch: Partial<Entry> = {}, chat: ChatMessage[] = []): DemoState => ({
  ...initialState,
  onboarded: true,
  entries: [entry('e1', 0, { body: BODY, title: 'Late night', reflection: aiReflection(), reflectionStatus: 'ready', ...patch })],
  chats: chat.length ? { e1: chat } : {},
});

async function open(state: DemoState, initialUrl: string) {
  const invoke = answer();
  const sync: SyncInfo = { status: 'synced', pending: 0, retry: () => {}, refresh: async () => {}, ensureSynced: jest.fn(async () => true) };
  const value: RealAi = { reflections: true, insights: false, followUps: true, needs: null, account: 'user-a', invoke, outputs: null };
  function Layout() {
    return (
      <RealAiProvider value={value}>
        <DemoStoreProvider initial={state}>
          <SyncContext value={sync}>
            <SnackbarProvider>
              <Stack />
            </SnackbarProvider>
          </SyncContext>
        </DemoStoreProvider>
      </RealAiProvider>
    );
  }
  await renderRouter({ _layout: Layout, 'entry/[id]/index': EntryDetail, 'entry/[id]/talk': Talk }, { initialUrl });
  return invoke;
}

const typeAndSend = async (text: string) => {
  await act(async () => fireEvent.changeText(screen.getByLabelText('Follow-up message'), text));
  await fireEvent.press(screen.getByRole('button', { name: 'Send follow-up' }));
};

describe('question chips in the reflection', () => {
  it('shows an AI reflection’s questions as chips under “Kindway wonders”, with no plain question line', async () => {
    await open(journal(), '/entry/e1');
    expect(await screen.findByText('Kindway wonders…', {}, wait)).toBeOnTheScreen();
    for (const q of QUESTIONS) expect(screen.getByRole('button', { name: q })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: QUESTIONS[0] }).props.accessibilityHint).toBe('Opens the conversation with this question');
  });

  it('opens the conversation with the tapped question', async () => {
    await open(journal(), '/entry/e1');
    await fireEvent.press(await screen.findByRole('button', { name: QUESTIONS[1] }, wait));
    expect(await screen.findByLabelText(`Kindway asked: ${QUESTIONS[1]}`, {}, wait)).toBeOnTheScreen();
    expect(screen.getByLabelText('Follow-up message').props.autoFocus).toBe(true);
  });

  it('keeps the plain question on simulated reflections, with no chips', async () => {
    await open(journal({ reflection: { style: 'understand', source: 'simulated', acknowledge: 'Fictional.', basedOn: BODY, question: 'What would help tonight?' } }), '/entry/e1');
    expect(await screen.findByText('What would help tonight?', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText('Kindway wonders…')).toBeNull();
    expect(screen.queryByRole('button', { name: 'What would help tonight?' })).toBeNull();
  });
});

describe('asked questions in the conversation', () => {
  it('posts the question as a Kindway bubble, and sends the answer with it as asked', async () => {
    const invoke = await open(journal(), '/entry/e1/talk?ask=1');
    expect(await screen.findByLabelText(`Kindway asked: ${QUESTIONS[1]}`, {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('Kindway asked')).toBeOnTheScreen();
    expect(screen.queryByText('Written by AI')).toBeNull();
    expect(screen.getByLabelText('Follow-up message').props.autoFocus).toBe(true);
    await typeAndSend('Fictional: a quiet day');
    expect(await screen.findByText('Fictional AI answer.', {}, wait)).toBeOnTheScreen();
    const first = (invoke.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(first).toMatchObject({ message: 'Fictional: a quiet day', asked: QUESTIONS[1], reflection_id: 'ref-1' });
    expect(first.context_ids).toEqual([]);
    // Only the first answer carries it.
    await typeAndSend('Fictional: and more');
    await screen.findByLabelText('You: Fictional: and more', {}, wait);
    await act(async () => {});
    expect((invoke.mock.calls[1] as unknown[])[1]).not.toHaveProperty('asked');
  });

  it('does not duplicate the question when the chat already ends with it', async () => {
    const asked: ChatMessage = { id: 'q1', from: 'kindway', text: QUESTIONS[1], source: 'ai', asked: true };
    await open(journal({}, [asked]), '/entry/e1/talk?ask=1');
    expect(await screen.findByLabelText(`Kindway asked: ${QUESTIONS[1]}`, {}, wait)).toBeOnTheScreen();
    expect(screen.getAllByLabelText(`Kindway asked: ${QUESTIONS[1]}`)).toHaveLength(1);
  });

  it('leaving and coming back to a chat that ends with the question still sends the answer as asked', async () => {
    const asked: ChatMessage = { id: 'q1', from: 'kindway', text: QUESTIONS[1], source: 'ai', asked: true };
    const invoke = await open(journal({}, [asked]), '/entry/e1/talk');
    expect(await screen.findByLabelText(`Kindway asked: ${QUESTIONS[1]}`, {}, wait)).toBeOnTheScreen();
    await typeAndSend('Fictional: back again');
    expect(await screen.findByText('Fictional AI answer.', {}, wait)).toBeOnTheScreen();
    expect(bodyOf(invoke, 0)).toMatchObject({ asked: QUESTIONS[1] });
  });

  it('ignores an ask that is out of range or not a number', async () => {
    await open(journal(), '/entry/e1/talk?ask=7');
    expect(await screen.findByLabelText('Follow-up message', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText('Kindway asked')).toBeNull();
    expect(screen.getByLabelText('Follow-up message').props.autoFocus).toBeFalsy();
  });

  it('still prefills a topic', async () => {
    await open(journal(), '/entry/e1/talk?topic=sleep');
    expect(await screen.findByDisplayValue('Can we talk about sleep?', {}, wait)).toBeOnTheScreen();
  });
});

describe('question chips under the latest reply', () => {
  const chat = [reply('fu-1', ['Older question?']), reply('fu-2', ['What stayed with you?', 'What would help tomorrow?'])];

  it('shows only the latest AI reply’s questions, and posting one appends an asked bubble', async () => {
    const invoke = await open(journal({}, chat), '/entry/e1/talk');
    expect(await screen.findByRole('button', { name: 'What stayed with you?' }, wait)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Older question?' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'What would help tomorrow?' }));
    expect(await screen.findByLabelText('Kindway asked: What would help tomorrow?', {}, wait)).toBeOnTheScreen();
    // Those chips belonged to a reply that is no longer the latest message.
    expect(screen.queryByRole('button', { name: 'What stayed with you?' })).toBeNull();
    await typeAndSend('Fictional: rest');
    expect(await screen.findByText('Fictional AI answer.', {}, wait)).toBeOnTheScreen();
    expect((invoke.mock.calls[0] as unknown[])[1]).toMatchObject({ asked: 'What would help tomorrow?', context_ids: ['fu-1', 'fu-2'] });
  });

  it('shows no chips for a simulated reply, even one carrying questions', async () => {
    await open(journal({}, [{ id: 'k1', from: 'kindway', text: 'Fictional canned', questions: ['Hidden?'] }]), '/entry/e1/talk');
    expect(await screen.findByLabelText('Simulated reply: Fictional canned', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Hidden?' })).toBeNull();
  });
});

const bodyOf = (invoke: jest.Mock, call: number) => (invoke.mock.calls[call] as unknown[])[1] as Record<string, unknown>;

describe('the asked question across clearing, failures and consent', () => {
  it('does not send a cleared question as asked', async () => {
    const invoke = await open(journal(), '/entry/e1/talk?ask=1');
    await screen.findByLabelText(`Kindway asked: ${QUESTIONS[1]}`, {}, wait);
    await fireEvent.press(screen.getByRole('button', { name: 'Clear this conversation' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Clear' }, wait));
    expect(screen.queryByText('Kindway asked')).toBeNull();
    await typeAndSend('Fictional: fresh start');
    expect(await screen.findByText('Fictional AI answer.', {}, wait)).toBeOnTheScreen();
    expect(bodyOf(invoke, 0)).not.toHaveProperty('asked');
  });

  it('keeps the asked question for a retry after a failed send', async () => {
    const invoke = await open(journal(), '/entry/e1/talk?ask=0');
    await screen.findByLabelText(`Kindway asked: ${QUESTIONS[0]}`, {}, wait);
    invoke.mockImplementationOnce(async () => ({ status: 503, body: {} }));
    await typeAndSend('Fictional: first try');
    expect(await screen.findByText('No reply this time', {}, wait)).toBeOnTheScreen();
    await typeAndSend('Fictional: second try');
    expect(await screen.findByText('Fictional AI answer.', {}, wait)).toBeOnTheScreen();
    expect(bodyOf(invoke, 0)).toMatchObject({ asked: QUESTIONS[0] });
    expect(bodyOf(invoke, 1)).toMatchObject({ asked: QUESTIONS[0] });
  });

  it('still sends it as asked when consent is given in the middle', async () => {
    const invoke = answer();
    const grant = jest.fn(async (_scope: string) => true);
    const sync: SyncInfo = { status: 'synced', pending: 0, retry: () => {}, refresh: async () => {}, ensureSynced: jest.fn(async () => true) };
    function Layout() {
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
      const real: RealAi = { reflections: true, insights: false, followUps: allowed, needs: null, account: 'user-a', invoke, outputs: null };
      return (
        <AiConsentProvider value={consent}>
          <RealAiProvider value={real}>
            <DemoStoreProvider initial={journal()}>
              <SyncContext value={sync}>
                <SnackbarProvider>
                  <Stack />
                </SnackbarProvider>
              </SyncContext>
            </DemoStoreProvider>
          </RealAiProvider>
        </AiConsentProvider>
      );
    }
    await renderRouter({ _layout: Layout, 'entry/[id]/talk': Talk }, { initialUrl: '/entry/e1/talk?ask=2' });
    await screen.findByLabelText(`Kindway asked: ${QUESTIONS[2]}`, {}, wait);
    await typeAndSend('Fictional: my sister');
    await screen.findByText('Allow AI replies here?', {}, wait);
    await fireEvent.press(screen.getByLabelText(/I’ve read what would be sent/));
    await fireEvent.press(screen.getByRole('button', { name: 'Allow and send' }));
    expect(await screen.findByText('Fictional AI answer.', {}, wait)).toBeOnTheScreen();
    expect(bodyOf(invoke, 0)).toMatchObject({ asked: QUESTIONS[2], message: 'Fictional: my sister' });
  });
});
