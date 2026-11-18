import { Text } from 'react-native';
import { Slot } from 'expo-router';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import Journal from '@/app/(tabs)/journal';
import TopicPage from '@/app/topic/[id]';
import { SnackbarProvider } from '@/components/feedback';
import type { Topic } from '@/data/types';
import { DemoStoreProvider, initialState, useStore, type DemoState } from '@/state/demo-store';
import { entry } from '@/test-utils/entries';

const topic = (id: string, name: string, patch: Partial<Topic> = {}): Topic => ({ id, name, status: 'open', createdAt: '2026-11-01T09:00:00.000Z', entryIds: [], ...patch });

/** Shows the bits of state the screens change, so tests can check what was dispatched. */
function Probe() {
  const { state } = useStore();
  return (
    <>
      <Text>{`topics:${state.topics.map((t) => `${t.name}|${t.status}`).join(',')}`}</Text>
      <Text>{`kept:${state.kept.map((k) => k.text).join(',')}`}</Text>
    </>
  );
}

/** One store above every route, so state outlives a screen that navigates away. */
const layoutWith = (state: DemoState) =>
  function Layout() {
    return (
      <DemoStoreProvider initial={state}>
        <SnackbarProvider>
          <Slot />
          <Probe />
        </SnackbarProvider>
      </DemoStoreProvider>
    );
  };

const Stub = (label: string) =>
  function StubScreen() {
    return <Text>{label}</Text>;
  };

const entries = [entry('e1', 5, { title: 'Older walk' }), entry('e2', 1, { title: 'Newer call' })];
const seeded = (topics: Topic[]): DemoState => ({ ...initialState, entries, topics });

const openJournal = (state: DemoState, url = '/journal') => renderRouter({ _layout: layoutWith(state), journal: Journal, 'topic/[id]': Stub('topic page') }, { initialUrl: url });
const openTopic = (state: DemoState, id = 'p1') =>
  renderRouter({ _layout: layoutWith(state), 'topic/[id]': TopicPage, 'entry/[id]/index': Stub('entry page'), index: Stub('home') }, { initialUrl: `/topic/${id}` });

describe('Journal topics view', () => {
  it('shows open topics and a collapsed Resolved section', async () => {
    const state = seeded([topic('p1', 'Work stress'), topic('p2', 'Sleep'), topic('p3', 'Old worry', { status: 'resolved' })]);
    await openJournal(state);
    await fireEvent.press(await screen.findByRole('radio', { name: 'Topics' }));
    expect(await screen.findByText('Work stress')).toBeOnTheScreen();
    expect(screen.getByText('Sleep')).toBeOnTheScreen();
    expect(screen.queryByText('Old worry')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Resolved (1)' }));
    expect(await screen.findByText('Old worry')).toBeOnTheScreen();
  });

  it('opens on the view named by the route param', async () => {
    await openJournal(seeded([topic('p1', 'Work stress')]), '/journal?view=topics');
    expect(await screen.findByText('Work stress')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Topics' })).toBeChecked();
  });

  it('has a Kept view', async () => {
    await openJournal(seeded([]), '/journal?view=kept');
    expect(await screen.findByRole('radio', { name: 'Kept' })).toBeChecked();
  });

  it('shows the empty copy when there are no topics', async () => {
    await openJournal(seeded([]), '/journal?view=topics');
    expect(await screen.findByText('Topics are the things you keep coming back to. Save one from an entry, or add it here.')).toBeOnTheScreen();
  });

  it('adds a trimmed topic and keeps Add disabled for a blank name', async () => {
    await openJournal(seeded([]), '/journal?view=topics');
    await fireEvent.press(await screen.findByRole('button', { name: 'New topic' }));
    const field = await screen.findByLabelText('Topic name');
    expect(field.props.maxLength).toBe(40);
    await fireEvent.changeText(field, '   ');
    expect(screen.getByRole('button', { name: 'Add topic' })).toBeDisabled();
    await fireEvent.changeText(field, '  Moving house  ');
    await fireEvent.press(screen.getByRole('button', { name: 'Add topic' }));
    expect(await screen.findByText('topics:Moving house|open')).toBeOnTheScreen();
    expect(await screen.findByRole('button', { name: /Moving house/ })).toBeOnTheScreen();
  });

  it('opens a topic page from the list', async () => {
    await openJournal(seeded([topic('p1', 'Work stress')]), '/journal?view=topics');
    await fireEvent.press(await screen.findByRole('button', { name: /Work stress/ }));
    expect(await screen.findByText('topic page')).toBeOnTheScreen();
  });
});

describe('topic page', () => {
  it('lists linked entries newest first and opens one', async () => {
    await openTopic(seeded([topic('p1', 'Work stress', { entryIds: ['e1', 'e2'] })]));
    const rows = await screen.findAllByRole('button', { name: /Open entry/ });
    expect(rows[0]).toHaveAccessibleName(/Newer call/);
    expect(rows[1]).toHaveAccessibleName(/Older walk/);
    await fireEvent.press(rows[0]);
    expect(await screen.findByText('entry page')).toBeOnTheScreen();
  });

  it('renames from the menu with a local draft and blocks a blank name', async () => {
    await openTopic(seeded([topic('p1', 'Work stress')]));
    await fireEvent.press(await screen.findByRole('button', { name: 'Topic options' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Rename' }));
    const field = await screen.findByLabelText('Topic name');
    expect(field.props.maxLength).toBe(40);
    expect(field.props.value).toBe('Work stress');
    await fireEvent.changeText(field, '  ');
    expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled();
    await fireEvent.changeText(field, '  Job worries ');
    await fireEvent.press(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByText('topics:Job worries|open')).toBeOnTheScreen();
  });

  it('asks before deleting', async () => {
    await openTopic(seeded([topic('p1', 'Work stress')]));
    await fireEvent.press(await screen.findByRole('button', { name: 'Topic options' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Delete this topic? Its entries stay in your journal.')).toBeOnTheScreen();
    expect(screen.getByText('topics:Work stress|open')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Delete topic' }));
    expect(await screen.findByText('topics:')).toBeOnTheScreen();
  });

  it('resolves with what helped, then offers Reopen', async () => {
    await openTopic(seeded([topic('p1', 'Work stress', { entryIds: ['e1'] })]));
    await fireEvent.press(await screen.findByRole('button', { name: 'Resolve' }));
    expect(await screen.findByText('Chapter closed.')).toBeOnTheScreen();
    const field = screen.getByLabelText('What helped?');
    expect(field.props.maxLength).toBe(200);
    await fireEvent.changeText(field, 'Talking to my manager');
    await fireEvent.press(screen.getByRole('button', { name: 'Mark resolved' }));
    expect(await screen.findByText('topics:Work stress|resolved')).toBeOnTheScreen();
    expect(screen.getByText('kept:Talking to my manager')).toBeOnTheScreen();
    await fireEvent.press(await screen.findByRole('button', { name: 'Reopen' }));
    expect(await screen.findByText('topics:Work stress|open')).toBeOnTheScreen();
  });

  it('resolves without words', async () => {
    await openTopic(seeded([topic('p1', 'Work stress')]));
    await fireEvent.press(await screen.findByRole('button', { name: 'Resolve' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Mark resolved' }));
    expect(await screen.findByText('topics:Work stress|resolved')).toBeOnTheScreen();
    expect(screen.getByText('kept:')).toBeOnTheScreen();
  });

  it('offers Talk about this', async () => {
    await openTopic(seeded([topic('p1', 'Work stress')]));
    await screen.findByText('Work stress');
    expect(screen.getByRole('button', { name: 'Talk about this' })).toBeOnTheScreen();
  });

  it('says so for a topic that is gone', async () => {
    await openTopic(seeded([]), 'nope');
    expect(await screen.findByText('This topic isn’t here any more.')).toBeOnTheScreen();
  });
});
