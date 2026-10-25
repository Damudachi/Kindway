import { Stack } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import Talk from '@/app/entry/[id]/talk';
import EntryDetail from '@/app/entry/[id]/index';
import Tomorrow from '@/app/tomorrow';
import { SnackbarProvider } from '@/components/feedback';
import { hasAutoTitle, titleFrom } from '@/data/titles';
import type { ChatMessage, Entry, Reflection } from '@/data/types';
import { requestAiFollowUp, toReflection, type Invoke } from '@/services/ai/remote';
import { SyncContext, type SyncInfo } from '@/state/cloud-sync';
import { DemoStoreProvider, initialState, reducer, useStore, type DemoState } from '@/state/demo-store';
import { RealAiProvider, type RealAi } from '@/state/real-ai';
import { entry } from '@/test-utils/entries';

jest.setTimeout(30000);
const wait = { timeout: 8000 };

const BODY = 'Fictional: work ran late again and then my sister called about the move. I barely slept.';
const reflection = (patch: Partial<Reflection> = {}): Reflection => ({
  style: 'understand',
  source: 'ai',
  ai: { id: 'ref-1', provider: 'groq', model: 'openai/gpt-oss-120b', createdAt: '2026-10-25T12:00:00.000Z' },
  acknowledge: 'Fictional acknowledgment.',
  basedOn: BODY,
  ...patch,
});

describe('entry titles', () => {
  it('the device title is the first sentence, cut with an ellipsis when long', () => {
    expect(titleFrom('a quiet evening. Then more.')).toBe('A quiet evening');
    expect(titleFrom('Today I woke up and felt heavy for no reason')).toBe('Today I woke up and felt…');
    expect(titleFrom('Work, again — ')).toBe('Work, again');
    expect(titleFrom('   ')).toBe('Untitled entry');
  });

  it('an AI title replaces a device title, old or new, but never a rename', () => {
    const land = (title: string) =>
      reducer({ ...initialState, entries: [entry('e1', 0, { body: BODY, title })] }, { type: 'setReflection', id: 'e1', status: 'ready', reflection: reflection({ title: 'Work, family and no sleep' }) })
        .entries[0].title;
    expect(land(titleFrom(BODY))).toBe('Work, family and no sleep');
    // The rule before 2026-10-25: first six words, no ellipsis.
    expect(land('Fictional: work ran late again and')).toBe('Work, family and no sleep');
    expect(land('My own name for it')).toBe('My own name for it');
  });

  it('only counts titles the device made as automatic', () => {
    expect(hasAutoTitle({ body: BODY, title: titleFrom(BODY) })).toBe(true);
    expect(hasAutoTitle({ body: BODY, title: 'Work, family and no sleep' })).toBe(false);
  });

  it('reads the title and other topics from a stored AI reflection', () => {
    const stored = {
      id: 'ref-1',
      style: 'understand',
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      created_at: '2026-10-25T12:00:00.000Z',
      output: { acknowledgment: 'Fictional.', title: ' Work, family and no sleep ', other_topics: ['your sister’s move', '', 3, 'sleep'] },
    };
    expect(toReflection(stored, BODY)).toMatchObject({ title: 'Work, family and no sleep', otherTopics: ['your sister’s move', 'sleep'] });
    expect(toReflection({ ...stored, output: { acknowledgment: 'Fictional.' } }, BODY)).not.toHaveProperty('otherTopics');
  });
});

function Probe() {
  const { state } = useStore();
  const t = state.tomorrow;
  return (
    <>
      <Text>title:{state.entries[0]?.title}</Text>
      <Text>step:{t ? `${t.text}|${t.source?.kind ?? 'none'}` : 'none'}</Text>
    </>
  );
}

async function open(state: DemoState, initialUrl: string) {
  const sync: SyncInfo = { status: 'synced', pending: 0, retry: () => {}, ensureSynced: jest.fn(async () => true) };
  const value: RealAi = { reflections: true, insights: false, followUps: true, needs: null, account: 'user-a', invoke: jest.fn(), outputs: null };
  function Layout() {
    return (
      <RealAiProvider value={value}>
        <DemoStoreProvider initial={state}>
          <SyncContext value={sync}>
            <SnackbarProvider>
              <Stack />
              <Probe />
            </SnackbarProvider>
          </SyncContext>
        </DemoStoreProvider>
      </RealAiProvider>
    );
  }
  await renderRouter({ _layout: Layout, 'entry/[id]/index': EntryDetail, 'entry/[id]/talk': Talk, tomorrow: Tomorrow }, { initialUrl });
}

const journal = (patch: Partial<Entry> = {}, chat: ChatMessage[] = []): DemoState => ({
  ...initialState,
  onboarded: true,
  entries: [entry('e1', 0, { body: BODY, title: 'Late night, long call', reflection: reflection(), reflectionStatus: 'ready', ...patch })],
  chats: chat.length ? { e1: chat } : {},
});

describe('renaming an entry', () => {
  it('saves the new title, and an empty one goes back to the start of the entry', async () => {
    await open(journal(), '/entry/e1');
    await fireEvent.press(await screen.findByRole('button', { name: 'Late night, long call. Rename entry' }, wait));
    await act(async () => fireEvent.changeText(screen.getByDisplayValue('Late night, long call'), 'The move'));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('title:The move', {}, wait)).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'The move. Rename entry' }));
    await act(async () => fireEvent.changeText(screen.getByDisplayValue('The move'), '  '));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(`title:${titleFrom(BODY)}`, {}, wait)).toBeOnTheScreen();
  });
});

describe('an entry about several things', () => {
  it('offers the other topics, and each opens Talk through ready to ask about it, without sending', async () => {
    await open(journal({ reflection: reflection({ otherTopics: ['your sister’s move', 'sleep'] }) }), '/entry/e1');
    expect(await screen.findByText('Also in this entry', {}, wait)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'sleep' }));
    expect(await screen.findByDisplayValue('Can we talk about sleep?', {}, wait)).toBeOnTheScreen();
  });

  it('shows nothing extra for an entry about one thing', async () => {
    await open(journal(), '/entry/e1');
    expect(await screen.findByText('Fictional acknowledgment.', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText('Also in this entry')).toBeNull();
  });
});

describe('Tomorrow Bridge from Talk through', () => {
  const STEP = 'Fictional step: text my sister to pick a moving day';
  const chat = (step?: string): ChatMessage[] => [
    { id: 'u1', from: 'me', text: 'Fictional: what do I do about the move?', source: 'ai' },
    { id: 'ai:fu-1', from: 'kindway', text: 'Fictional AI reply.', source: 'ai', ai: { id: 'fu-1', provider: 'groq', model: 'm', createdAt: '2026-10-25T12:00:00.000Z' }, ...(step && { step }) },
  ];

  it('a reply’s step opens Tomorrow Bridge filled in, and is saved only on Save', async () => {
    await open(journal({}, chat(STEP)), '/entry/e1/talk');
    await fireEvent.press(await screen.findByRole('button', { name: 'Save to Tomorrow Bridge' }, wait));
    expect(await screen.findByText('Suggested by AI while talking through “Late night, long call”', {}, wait)).toBeOnTheScreen();
    expect(screen.getByDisplayValue(STEP)).toBeOnTheScreen();
    expect(screen.getByText('step:none')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Save my step' }));
    expect(await screen.findByText(`step:${STEP}|reflection`, {}, wait)).toBeOnTheScreen();
    expect(await screen.findByText('Saved to Tomorrow Bridge.', {}, wait)).toBeOnTheScreen();
  });

  it('reads the step from the server reply', async () => {
    const follow_up = { id: 'fu-2', entry_id: 'e1', created_at: '2026-10-25T12:00:00.000Z', provider: 'groq', model: 'm', output: { reply: 'Fictional.', suggested_step: ` ${STEP} ` } };
    const invoke: Invoke = async () => ({ status: 200, body: { status: 'ready', follow_up } });
    const result = await requestAiFollowUp(invoke, { entryId: 'e1', message: 'x', style: 'forward', contextIds: [], reflectionId: null });
    expect(result).toMatchObject({ ok: true, message: { step: STEP } });
  });

  it('a reply without a step offers nothing', async () => {
    await open(journal({}, chat()), '/entry/e1/talk');
    expect(await screen.findByText('Fictional AI reply.', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Save to Tomorrow Bridge' })).toBeNull();
  });
});
