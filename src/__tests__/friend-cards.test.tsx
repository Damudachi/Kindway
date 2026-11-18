import { router, Slot } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import Today from '@/app/(tabs)/today';
import EntryDetail from '@/app/entry/[id]/index';
import Write from '@/app/write';
import { SnackbarProvider } from '@/components/feedback';
import type { Entry, Reflection, Topic } from '@/data/types';
import { DemoStoreProvider, initialState, useStore, type DemoState } from '@/state/demo-store';
import { entry } from '@/test-utils/entries';

jest.setTimeout(30000);
const wait = { timeout: 8000 };

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysFromToday = (n: number) => {
  const d = new Date();
  return localDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
};
const topic = (id: string, name: string, patch: Partial<Topic> = {}): Topic => ({ id, name, status: 'open', createdAt: new Date().toISOString(), entryIds: [], ...patch });
const aiReflection = (patch: Partial<Reflection> = {}): Reflection => ({ style: 'understand', source: 'ai', acknowledge: 'Fictional acknowledgment.', basedOn: 'Fictional body.', ...patch });
const reflected = (id: string, daysBack: number, patch: Partial<Reflection> = {}, e: Partial<Entry> = {}) =>
  entry(id, daysBack, { body: 'Fictional body.', reflection: aiReflection(patch), reflectionStatus: 'ready', ...e });

function Probe() {
  const { state } = useStore();
  return (
    <>
      <Text>{`topics:${state.topics.map((t) => `${t.name}|${t.status}|${t.entryIds.join('+')}|${t.checkInShownAt ? 'shown' : 'unshown'}`).join(',')}`}</Text>
      <Text>{`dismissed:${state.dismissedCheckIns.join(',')}`}</Text>
      <Text>{`entries:${state.entries.length}`}</Text>
    </>
  );
}

async function open(patch: Partial<DemoState>, initialUrl = '/today') {
  const state: DemoState = { ...initialState, onboarded: true, ...patch };
  function Layout() {
    return (
      <DemoStoreProvider initial={state}>
        <SnackbarProvider>
          <Slot />
          <Probe />
        </SnackbarProvider>
      </DemoStoreProvider>
    );
  }
  await renderRouter(
    { _layout: Layout, today: Today, write: Write, 'entry/[id]/index': EntryDetail, 'topic/[id]': () => <Text>topic page</Text>, 'entry/[id]/talk': () => <Text>talk page</Text> },
    { initialUrl },
  );
}

describe('Today: Ongoing', () => {
  it('shows nothing when there are no open topics', async () => {
    await open({ entries: [entry('a', 3)], topics: [topic('p1', 'Done thing', { status: 'resolved' })] });
    await screen.findByText(/How are you arriving/, {}, wait);
    expect(screen.queryByText('Ongoing')).toBeNull();
  });

  it('lists up to three open topics, and a tap opens the topic', async () => {
    const topics = [topic('p1', 'Work stress'), topic('p2', 'Sleep'), topic('p3', 'The move'), topic('p4', 'Money')];
    await open({ entries: [entry('a', 3)], topics });
    expect(await screen.findByText('Ongoing', {}, wait)).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: /Work stress|Sleep|The move|Money/ })).toHaveLength(3);
    await fireEvent.press(screen.getByRole('button', { name: 'Work stress' }));
    expect(await screen.findByText('topic page', {}, wait)).toBeOnTheScreen();
    expect(screen).toHavePathname('/topic/p1');
  });
});

describe('Today: Checking in', () => {
  const exam = () => reflected('e1', 2, { checkIns: [{ question: 'How did the exam go?', on: daysFromToday(0) }] });

  it('shows a due check-in, and tapping opens the page with that question and dismisses it', async () => {
    await open({ entries: [exam()] });
    expect(await screen.findByText('Checking in', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('How did the exam go?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Write about this' }));
    expect(await screen.findByText('How did the exam go?', {}, wait)).toBeOnTheScreen();
    expect(screen).toHavePathname('/write');
    expect(screen.getByLabelText('Journal entry')).toBeOnTheScreen();
    // Nothing is written yet, so nothing is dismissed.
    expect(screen.getByText('dismissed:')).toBeOnTheScreen();
  });

  it('backing out of the page keeps the check-in; saving the entry dismisses it', async () => {
    await open({ entries: [exam()] });
    await fireEvent.press(await screen.findByRole('button', { name: 'Write about this' }, wait));
    await screen.findByLabelText('Journal entry', {}, wait);
    await act(async () => router.back());
    expect(await screen.findByText('Checking in', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('dismissed:')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Write about this' }));
    await act(async () => fireEvent.changeText(await screen.findByLabelText('Journal entry', {}, wait), 'It went fine.'));
    await fireEvent.press(screen.getByRole('button', { name: 'Save entry' }));
    expect(await screen.findByText('dismissed:e1:0', {}, wait)).toBeOnTheScreen();
  });

  it('is not shown before its date', async () => {
    await open({ entries: [reflected('e1', 2, { checkIns: [{ question: 'How did the exam go?', on: daysFromToday(1) }] })] });
    await screen.findByText(/How are you arriving/, {}, wait);
    expect(screen.queryByText('Checking in')).toBeNull();
  });

  it('“Not now” dismisses it for good', async () => {
    await open({ entries: [exam()] });
    await fireEvent.press(await screen.findByRole('button', { name: 'Not now' }, wait));
    expect(screen.queryByText('Checking in')).toBeNull();
    expect(screen.getByText('dismissed:e1:0')).toBeOnTheScreen();
  });

  it('never shows a simulated reflection’s check-ins', async () => {
    await open({ entries: [reflected('e1', 2, { source: 'simulated', checkIns: [{ question: 'How did the exam go?', on: daysFromToday(0) }] })] });
    await screen.findByText(/How are you arriving/, {}, wait);
    expect(screen.queryByText('Checking in')).toBeNull();
  });
});

describe('Today: a quiet topic', () => {
  const quiet = () => ({ entries: [entry('old', 20)], topics: [topic('p1', 'Mum’s health', { entryIds: ['old'] })] });

  it('asks about it without recording anything until the user acts', async () => {
    await open(quiet());
    expect(await screen.findByText('How are things with Mum’s health these days?', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('topics:Mum’s health|open|old|unshown')).toBeOnTheScreen();
  });

  it('“Not now” records that it was shown and hides it', async () => {
    await open(quiet());
    await fireEvent.press(await screen.findByRole('button', { name: 'Not now' }, wait));
    expect(screen.queryByText('How are things with Mum’s health these days?')).toBeNull();
    expect(screen.getByText('topics:Mum’s health|open|old|shown')).toBeOnTheScreen();
  });

  it('opens the page with the question and the topic, and saving links the entry to the topic', async () => {
    await open(quiet());
    await fireEvent.press(await screen.findByRole('button', { name: 'Write about this' }, wait));
    expect(await screen.findByText('How are things with Mum’s health these days?', {}, wait)).toBeOnTheScreen();
    expect(screen).toHavePathname('/write');
    expect(screen.getByText('topics:Mum’s health|open|old|shown')).toBeOnTheScreen();
    await act(async () => fireEvent.changeText(screen.getByLabelText('Journal entry'), 'Mum is doing better.'));
    await fireEvent.press(screen.getByRole('button', { name: 'Save entry' }));
    expect(await screen.findByText(/^topics:Mum’s health\|open\|old\+n\d+\|shown$/, {}, wait)).toBeOnTheScreen();
  });

  it('shows at most one asking card: a due check-in comes first', async () => {
    const { entries, topics } = quiet();
    await open({ entries: [...entries, reflected('e1', 2, { checkIns: [{ question: 'How did the exam go?', on: daysFromToday(0) }] })], topics });
    expect(await screen.findByText('How did the exam go?', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText('How are things with Mum’s health these days?')).toBeNull();
  });
});

describe('the composer with a topic', () => {
  it('ignores the prompt and topic when editing', async () => {
    const e = entry('e1', 1, { body: 'Original.' });
    await open({ entries: [e], topics: [topic('p1', 'Sleep')], draft: { ...initialState.draft, text: 'Original.', editingId: 'e1' } }, '/write?edit=e1&prompt=Hello%3F&topic=p1');
    await screen.findByLabelText('Journal entry', {}, wait);
    expect(screen.queryByText('Hello?')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByText('topics:Sleep|open||unshown')).toBeOnTheScreen();
  });

  it('does not attach a topic, prompt or check-in to an unrelated draft already on the page', async () => {
    await open({
      entries: [reflected('e1', 2, { checkIns: [{ question: 'How did the exam go?', on: daysFromToday(0) }] })],
      topics: [topic('p1', 'Sleep')],
      draft: { ...initialState.draft, text: 'Something else I was writing.' },
    });
    await fireEvent.press(await screen.findByRole('button', { name: 'Write about this' }, wait));
    expect(await screen.findByDisplayValue('Something else I was writing.', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText('How did the exam go?')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Save entry' }));
    await screen.findByText(/^entries:2$/, {}, wait);
    expect(screen.getByText('topics:Sleep|open||unshown')).toBeOnTheScreen();
    expect(screen.getByText('dismissed:')).toBeOnTheScreen();
  });

  it('does not link a topic that is resolved', async () => {
    await open({ topics: [topic('p1', 'Sleep', { status: 'resolved' })] }, '/write?prompt=Hi&topic=p1');
    await act(async () => fireEvent.changeText(await screen.findByLabelText('Journal entry', {}, wait), 'Some words.'));
    await fireEvent.press(screen.getByRole('button', { name: 'Save entry' }));
    expect(await screen.findByText('entries:1', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('topics:Sleep|resolved||unshown')).toBeOnTheScreen();
  });
});

describe('reflection: topics', () => {
  const view = (patch: Partial<Reflection>, topics: Topic[] = [], e: Partial<Entry> = {}) => open({ entries: [reflected('e1', 0, patch, e)], topics }, '/entry/e1');

  it('offers a suggested topic, and accepting adds it and links this entry', async () => {
    await view({ topicSuggestion: 'The job search' });
    expect(await screen.findByText('This keeps coming up: The job search. Save it as a topic?', {}, wait)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Save as a topic' }));
    expect(await screen.findByText('topics:The job search|open|e1|unshown', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText(/This keeps coming up/)).toBeNull();
  });

  it('links to an existing topic with the same name rather than adding a copy', async () => {
    await view({ topicSuggestion: 'the job search' }, [topic('p1', 'The job search')]);
    await fireEvent.press(await screen.findByRole('button', { name: 'Save as a topic' }, wait));
    expect(await screen.findByText('topics:The job search|open|e1|unshown', {}, wait)).toBeOnTheScreen();
  });

  it('does not suggest a topic this entry is already in', async () => {
    await view({ topicSuggestion: 'The job search' }, [topic('p1', 'The job search', { entryIds: ['e1'] })]);
    await screen.findByText('Fictional acknowledgment.', {}, wait);
    expect(screen.queryByText(/This keeps coming up/)).toBeNull();
  });

  it('says when an entry sounds like a saved topic, and one tap links it', async () => {
    await view({ topicMatches: ['p1'] }, [topic('p1', 'Job search')]);
    expect(await screen.findByText('This sounds like Job search. Add it?', {}, wait)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Add to Job search' }));
    expect(await screen.findByText('topics:Job search|open|e1|unshown', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText(/This sounds like/)).toBeNull();
  });

  it('skips matches that are already linked, resolved or unknown', async () => {
    await view({ topicMatches: ['p1', 'p2', 'gone'] }, [topic('p1', 'Linked', { entryIds: ['e1'] }), topic('p2', 'Closed', { status: 'resolved' })]);
    await screen.findByText('Fictional acknowledgment.', {}, wait);
    expect(screen.queryByText(/This sounds like/)).toBeNull();
  });

  it('shows none of it on a simulated reflection', async () => {
    await view({ source: 'simulated', topicSuggestion: 'The job search', topicMatches: ['p1'], otherTopics: ['Money'] }, [topic('p1', 'Job search')]);
    await screen.findByText('Fictional acknowledgment.', {}, wait);
    expect(screen.queryByText(/This keeps coming up|This sounds like/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save topic' })).toBeNull();
  });

  it('puts a Save topic action on an “Also in this entry” chip', async () => {
    await view({ otherTopics: ['Money worries'] });
    await fireEvent.press(await screen.findByRole('button', { name: 'Save topic' }, wait));
    expect(await screen.findByText('topics:Money worries|open|e1|unshown', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Save topic' })).toBeNull();
  });

  it('caps a saved name at 40 characters', async () => {
    const long = 'A'.repeat(60);
    await view({ otherTopics: [long] });
    await fireEvent.press(await screen.findByRole('button', { name: 'Save topic' }, wait));
    expect(await screen.findByText(`topics:${'A'.repeat(40)}|open|e1|unshown`, {}, wait)).toBeOnTheScreen();
  });
});

describe('entry detail: Topics row', () => {
  const view = (topics: Topic[]) => open({ entries: [reflected('e1', 0, {})], topics }, '/entry/e1');

  it('links and unlinks saved topics', async () => {
    await view([topic('p1', 'Sleep'), topic('p2', 'Money', { entryIds: ['e1'] })]);
    expect(await screen.findByText('Topics', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('Money')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Change topics' }));
    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Sleep' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Money' }));
    expect(screen.getByText('topics:Sleep|open|e1|unshown,Money|open||unshown')).toBeOnTheScreen();
  });

  it('is left out when there are no topics', async () => {
    await view([]);
    await screen.findByText('Entry options', {}, wait);
    expect(screen.queryByText('Topics')).toBeNull();
  });
});
