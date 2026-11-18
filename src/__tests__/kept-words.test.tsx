import { Slot, Stack } from 'expo-router';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import Journal from '@/app/(tabs)/journal';
import EntryDetail from '@/app/entry/[id]/index';
import Talk from '@/app/entry/[id]/talk';
import { HelpedBefore } from '@/components/helped-before';
import { SnackbarProvider } from '@/components/feedback';
import type { ChatMessage, Entry, KeptWord, Reflection } from '@/data/types';
import type { Invoke } from '@/services/ai/remote';
import { SyncContext, type SyncInfo } from '@/state/cloud-sync';
import { DemoStoreProvider, initialState, useStore, type DemoState } from '@/state/demo-store';
import { RealAiProvider, type RealAi } from '@/state/real-ai';
import { entry } from '@/test-utils/entries';

jest.setTimeout(30000);
const wait = { timeout: 8000 };

const KEEP = 'Keep these words';
const KEPT = 'Kept. Tap to remove';

const aiReflection = (patch: Partial<Reflection> = {}): Reflection => ({
  style: 'understand',
  source: 'ai',
  ai: { id: 'ref-1', provider: 'groq', model: 'openai/gpt-oss-120b', createdAt: '2026-10-25T12:00:00.000Z' },
  acknowledge: 'Fictional acknowledgment.',
  clarify: 'Fictional clarify.',
  perspective: 'Fictional perspective.',
  nextStep: 'Fictional next step.',
  ideas: ['Fictional idea one', 'Fictional idea two'],
  basedOn: 'Fictional body.',
  ...patch,
});
const simulated: Reflection = { style: 'understand', source: 'simulated', acknowledge: 'Simulated words.', perspective: 'Simulated view.', basedOn: 'Fictional body.' };

const aiReply = (id: string): ChatMessage => ({
  id: `ai:${id}`,
  from: 'kindway',
  text: `Fictional reply ${id}`,
  source: 'ai',
  ai: { id, provider: 'groq', model: 'm', createdAt: '2026-10-25T12:00:00.000Z' },
});
const asked: ChatMessage = { id: 'q1', from: 'kindway', text: 'A question Kindway asked?', source: 'ai', asked: true };
const simReply: ChatMessage = { id: 's1', from: 'kindway', text: 'A simulated reply', source: 'simulated' };

const word = (id: string, text: string, createdAt: string, source: KeptWord['source'] = { kind: 'reflection', entryId: 'e1' }): KeptWord => ({ id, text, source, createdAt });

function Probe() {
  const { state } = useStore();
  return <Text>{`kept:${state.kept.map((k) => `${k.text}@${JSON.stringify(k.source)}`).join('|')}`}</Text>;
}

const state = (entries: Entry[], extra: Partial<DemoState> = {}): DemoState => ({ ...initialState, onboarded: true, entries, ...extra });
const ready = (patch: Partial<Entry> = {}) => entry('e1', 0, { title: 'Late night', reflection: aiReflection(), reflectionStatus: 'ready', ...patch });

async function openEntry(s: DemoState, initialUrl: string) {
  const sync: SyncInfo = { status: 'synced', pending: 0, retry: () => {}, refresh: async () => {}, ensureSynced: jest.fn(async () => true) };
  const value: RealAi = { reflections: true, insights: false, followUps: true, needs: null, account: 'user-a', invoke: jest.fn() as unknown as Invoke, outputs: null };
  function Layout() {
    return (
      <RealAiProvider value={value}>
        <DemoStoreProvider initial={s}>
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
  await renderRouter({ _layout: Layout, 'entry/[id]/index': EntryDetail, 'entry/[id]/talk': Talk }, { initialUrl });
}

const Stub = (label: string) =>
  function StubScreen() {
    return <Text>{label}</Text>;
  };

async function openJournal(s: DemoState, initialUrl = '/journal?view=kept') {
  function Layout() {
    return (
      <DemoStoreProvider initial={s}>
        <SnackbarProvider>
          <Slot />
          <Probe />
        </SnackbarProvider>
      </DemoStoreProvider>
    );
  }
  await renderRouter({ _layout: Layout, journal: Journal, 'entry/[id]/index': Stub('entry page'), 'topic/[id]': Stub('topic page') }, { initialUrl });
}

describe('keeping reflection words', () => {
  it('keeps an AI acknowledgement with a reflection source, and a second press removes it', async () => {
    await openEntry(state([ready()]), '/entry/e1');
    const buttons = await screen.findAllByLabelText(KEEP, {}, wait);
    // acknowledge, clarify, perspective, two ideas, next step
    expect(buttons).toHaveLength(6);
    await fireEvent.press(buttons[0]);
    expect(await screen.findByText(`kept:Fictional acknowledgment.@${JSON.stringify({ kind: 'reflection', entryId: 'e1' })}`)).toBeOnTheScreen();
    await fireEvent.press(await screen.findByLabelText(KEPT));
    expect(await screen.findByText('kept:')).toBeOnTheScreen();
    expect(screen.queryByLabelText(KEPT)).toBeNull();
  });

  it('keeps an idea on its own', async () => {
    await openEntry(state([ready()]), '/entry/e1');
    const buttons = await screen.findAllByLabelText(KEEP, {}, wait);
    await fireEvent.press(buttons[4]);
    expect(await screen.findByText(`kept:Fictional idea two@${JSON.stringify({ kind: 'reflection', entryId: 'e1' })}`)).toBeOnTheScreen();
    expect(screen.getAllByLabelText(KEEP)).toHaveLength(5);
  });

  it('shows no keep button on a simulated reflection', async () => {
    await openEntry(state([ready({ reflection: simulated })]), '/entry/e1');
    expect(await screen.findByText('Simulated words.', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByLabelText(KEEP)).toBeNull();
  });

  it('shows a word kept earlier as kept', async () => {
    const s = state([ready()], { kept: [word('k1', 'Fictional perspective.', '2026-11-01T09:00:00.000Z')] });
    await openEntry(s, '/entry/e1');
    expect(await screen.findAllByLabelText(KEPT, {}, wait)).toHaveLength(1);
    expect(screen.getAllByLabelText(KEEP)).toHaveLength(5);
  });

  it('does not treat the same text from another entry as kept', async () => {
    const s = state([ready()], { kept: [word('k1', 'Fictional perspective.', '2026-11-01T09:00:00.000Z', { kind: 'reflection', entryId: 'other' })] });
    await openEntry(s, '/entry/e1');
    expect(await screen.findAllByLabelText(KEEP, {}, wait)).toHaveLength(6);
    expect(screen.queryByLabelText(KEPT)).toBeNull();
  });
});

describe('keeping chat replies', () => {
  it('keeps an AI reply as a follow_up word, but not asked or simulated bubbles', async () => {
    await openEntry(state([ready()], { chats: { e1: [asked, simReply, aiReply('r1')] } }), '/entry/e1/talk');
    const buttons = await screen.findAllByLabelText(KEEP, {}, wait);
    expect(buttons).toHaveLength(1);
    await fireEvent.press(buttons[0]);
    expect(await screen.findByText(`kept:Fictional reply r1@${JSON.stringify({ kind: 'follow_up', entryId: 'e1' })}`)).toBeOnTheScreen();
    await fireEvent.press(await screen.findByLabelText(KEPT));
    expect(await screen.findByText('kept:')).toBeOnTheScreen();
  });
});

describe('Kept view', () => {
  const entries = [entry('e1', 2, { title: 'Walk' })];
  const kept = [
    word('k1', 'Oldest words', '2026-11-01T09:00:00.000Z'),
    word('k2', 'Newest words', '2026-11-03T09:00:00.000Z'),
    word('k3', 'Middle words', '2026-11-02T09:00:00.000Z', { kind: 'topic', topicId: 'p1' }),
  ];

  it('shows an empty note when nothing is kept', async () => {
    await openJournal(state(entries));
    expect(await screen.findByText('Words you keep will appear here.')).toBeOnTheScreen();
  });

  it('lists newest first', async () => {
    await openJournal(state(entries, { kept }));
    const rows = await screen.findAllByRole('button', { name: /words/ });
    expect(rows[0]).toHaveAccessibleName(/Newest words/);
    expect(rows[1]).toHaveAccessibleName(/Middle words/);
    expect(rows[2]).toHaveAccessibleName(/Oldest words/);
  });

  it('opens the source entry', async () => {
    await openJournal(state(entries, { kept }));
    await fireEvent.press(await screen.findByRole('button', { name: /Newest words/ }));
    expect(await screen.findByText('entry page')).toBeOnTheScreen();
  });

  it('opens the topic for a topic word', async () => {
    await openJournal(state(entries, { kept, topics: [{ id: 'p1', name: 'Sleep', status: 'open', createdAt: '2026-11-01T09:00:00.000Z', entryIds: [] }] }));
    await fireEvent.press(await screen.findByRole('button', { name: /Middle words/ }));
    expect(await screen.findByText('topic page')).toBeOnTheScreen();
  });

  it('removes a word', async () => {
    await openJournal(state(entries, { kept }));
    const remove = await screen.findAllByRole('button', { name: 'Remove' });
    expect(remove).toHaveLength(3);
    await fireEvent.press(remove[0]);
    expect(screen.queryByText('Newest words')).not.toBeOnTheScreen();
    expect(screen.getByText('Oldest words')).toBeOnTheScreen();
    expect(screen.getByText(/^kept:Oldest words.*\|Middle words/)).toBeOnTheScreen();
  });
});

describe('HelpedBefore', () => {
  const kept = [word('k1', 'Walking helped me breathe', '2026-11-01T09:00:00.000Z')];

  async function mount(e: Entry, k: KeptWord[]) {
    function Layout() {
      return (
        <DemoStoreProvider initial={state([e], { kept: k })}>
          <Slot />
        </DemoStoreProvider>
      );
    }
    function Host() {
      return <HelpedBefore entry={e} />;
    }
    await renderRouter({ _layout: Layout, index: Host, journal: Stub('journal page') }, { initialUrl: '/' });
  }

  it('shows a kept word for an entry tagged Tired', async () => {
    await mount(entry('e9', 0, { feelings: ['Tired'] }), kept);
    expect(await screen.findByText('Something that helped before')).toBeOnTheScreen();
    expect(screen.getByText('Walking helped me breathe')).toBeOnTheScreen();
  });

  it('shows nothing when untagged or when nothing is kept', async () => {
    await mount(entry('e9', 0, { feelings: ['Happy'] }), kept);
    expect(screen.queryByText('Something that helped before')).toBeNull();
  });

  it('shows nothing without kept words', async () => {
    await mount(entry('e9', 0, { feelings: ['Lonely'] }), []);
    expect(screen.queryByText('Something that helped before')).toBeNull();
  });

  it('picks the same word for the same entry every time', async () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((t, i) => word(`k${i}`, `Word ${t}`, `2026-11-0${i + 1}T09:00:00.000Z`));
    const e = entry('e-stable', 0, { feelings: ['Worried'] });
    function Layout() {
      return (
        <DemoStoreProvider initial={state([e], { kept: many })}>
          <Slot />
        </DemoStoreProvider>
      );
    }
    function Twice() {
      return (
        <>
          <HelpedBefore entry={e} />
          <HelpedBefore entry={e} />
        </>
      );
    }
    await renderRouter({ _layout: Layout, index: Twice }, { initialUrl: '/' });
    const [one, two] = await screen.findAllByTestId('helped-before-text');
    expect(one.props.children).toBe(two.props.children);
  });

  it('See all opens the Kept view', async () => {
    await mount(entry('e9', 0, { feelings: ['Overwhelmed'] }), kept);
    await fireEvent.press(await screen.findByRole('button', { name: 'See all' }));
    expect(await screen.findByText('journal page')).toBeOnTheScreen();
    expect(screen).toHavePathname('/journal');
    expect(screen).toHaveSearchParams({ view: 'kept' });
  });

  it('appears at the bottom of an AI reflection', async () => {
    await openEntry(state([ready({ feelings: ['Tired'] })], { kept }), '/entry/e1');
    expect(await screen.findByText('Something that helped before', {}, wait)).toBeOnTheScreen();
  });

  it('appears at the bottom of a simulated reflection too', async () => {
    await openEntry(state([ready({ feelings: ['Tired'], reflection: simulated })], { kept }), '/entry/e1');
    expect(await screen.findByText('Something that helped before', {}, wait)).toBeOnTheScreen();
  });
});
