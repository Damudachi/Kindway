import { Stack } from 'expo-router';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import Today from '@/app/(tabs)/today';
import Write from '@/app/write';
import { SnackbarProvider } from '@/components/feedback';
import type { Entry, Reflection } from '@/data/types';
import { DemoStoreProvider, initialState, type DemoState } from '@/state/demo-store';
import { entry } from '@/test-utils/entries';

jest.setTimeout(30000);
const wait = { timeout: 8000 };

const aiReflection = (patch: Partial<Reflection> = {}): Reflection => ({ style: 'understand', source: 'ai', acknowledge: 'Fictional.', basedOn: '', ...patch });

async function open(entries: Entry[], initialUrl = '/today') {
  const state: DemoState = { ...initialState, onboarded: true, entries };
  function Layout() {
    return (
      <DemoStoreProvider initial={state}>
        <SnackbarProvider>
          <Stack />
        </SnackbarProvider>
      </DemoStoreProvider>
    );
  }
  await renderRouter({ _layout: Layout, today: Today, write: Write, 'entry/[id]': () => <Text>entry opened</Text> }, { initialUrl });
}

describe('Today: where you left off', () => {
  const left = () => entry('a', 2, { title: 'Leaving work', reflection: aiReflection({ question: 'What part of it felt most like home?' }) });

  it('offers the question the last reflection ended with, and starts the page with it', async () => {
    await open([left()]);
    expect(await screen.findByText('Where you left off', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('What part of it felt most like home?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Write about this' }));
    expect(await screen.findByDisplayValue(/^What part of it felt most like home\?/, {}, wait)).toBeOnTheScreen();
  });

  it('“Not now” puts it away without a word', async () => {
    await open([left()]);
    await fireEvent.press(await screen.findByRole('button', { name: 'Not now' }, wait));
    expect(screen.queryByText('Where you left off')).toBeNull();
  });

  it('is not offered once you have written today', async () => {
    await open([entry('t', 0), left()]);
    await screen.findByText(/How are you arriving/, {}, wait);
    expect(screen.queryByText('Where you left off')).toBeNull();
  });

  it('is not offered on a first day with nothing written', async () => {
    await open([]);
    await screen.findByText(/How are you arriving/, {}, wait);
    expect(screen.queryByText('Where you left off')).toBeNull();
  });
});

describe('Today: a look-back', () => {
  // Written today and on the last two days, so the trail is full and nothing else is on offer.
  const recent = () => [entry('t', 0), entry('r1', 1), entry('r2', 2)];

  it('brings back an entry from about a month ago, and opening it only reads it', async () => {
    await open([...recent(), entry('m', 30, { title: 'The week before I left' })]);
    expect(await screen.findByText('A month ago, you wrote', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('The week before I left')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Read it again' }));
    expect(await screen.findByText('entry opened', {}, wait)).toBeOnTheScreen();
    expect(screen).toHavePathname('/entry/m');
  });

  it('does not repeat an entry the trail already shows', async () => {
    await open([entry('m', 30, { title: 'The week before I left' })]);
    await screen.findByText(/How are you arriving/, {}, wait);
    expect(screen.queryByText('A month ago, you wrote')).toBeNull();
    expect(screen.getAllByText('The week before I left')).toHaveLength(1);
  });

  it('can be put away', async () => {
    await open([...recent(), entry('m', 30, { title: 'The week before I left' })]);
    await fireEvent.press(await screen.findByRole('button', { name: 'Not now' }, wait));
    expect(screen.queryByText('A month ago, you wrote')).toBeNull();
  });

  it('never brings back an entry that looks high-risk', async () => {
    await open([...recent(), entry('r', 30, { title: 'A hard night', body: 'Fictional: some nights I want to die.' })]);
    await screen.findByText(/How are you arriving/, {}, wait);
    expect(screen.queryByText('A month ago, you wrote')).toBeNull();
  });
});

describe('Just one line', () => {
  it('opens a short page: the words and the feelings, none of the optional extras', async () => {
    await open([]);
    await fireEvent.press(await screen.findByRole('button', { name: 'Just one line' }, wait));
    expect(await screen.findByText('One line is enough.', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('Check in with yourself, if you like')).toBeOnTheScreen();
    expect(screen.queryByText('A little help getting started')).toBeNull();
    expect(screen.queryByText('Notice one good thing')).toBeNull();
    expect(screen.queryByText('How should Kindway reflect this time?')).toBeNull();
  });

  it('the full page is unchanged', async () => {
    await open([], '/write');
    expect(await screen.findByText("What's on your mind?", {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('A little help getting started')).toBeOnTheScreen();
  });
});
