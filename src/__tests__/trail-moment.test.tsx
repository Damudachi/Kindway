import { useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import { router, Stack } from 'expo-router';
import { act, renderRouter, screen, fireEvent, waitFor } from 'expo-router/testing-library';
import { render } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import Today from '@/app/(tabs)/today';
import EntryDetail from '@/app/entry/[id]/index';
import { SnackbarProvider } from '@/components/feedback';
import { TrailMoment } from '@/components/trail-moment';
import { emptySnapshot } from '@/services/cloud/records';
import { DemoStoreProvider, initialState, reducer, useStore, type DemoState } from '@/state/demo-store';
import { MILESTONE_COPY } from '@/state/trail-progress';
import { entry } from '@/test-utils/entries';

// expo-router's test library swaps in Reanimated's mock, a plain object whose hook can be spied on.
const reduced = (on: boolean) => jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(on);

afterEach(() => jest.restoreAllMocks());

describe('TrailMoment', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('renders the count line', async () => {
    await render(<TrailMoment moment={{ entryId: 'a', count: 23 }} onDone={() => {}} />);
    expect(screen.getByText('23 days on your way.')).toBeOnTheScreen();
    expect(screen.getByText('23 days on your way.').props.accessibilityLiveRegion).toBe('polite');
  });

  it('renders the milestone line at a milestone', async () => {
    await render(<TrailMoment moment={{ entryId: 'a', count: 30, milestone: 30 }} onDone={() => {}} />);
    expect(screen.getByText(MILESTONE_COPY[30].line)).toBeOnTheScreen();
  });

  it('skips when pressed', async () => {
    const onDone = jest.fn();
    await render(<TrailMoment moment={{ entryId: 'a', count: 2 }} onDone={onDone} />);
    await fireEvent.press(screen.getByLabelText('Skip'));
    expect(onDone).toHaveBeenCalled();
  });

  it('dismisses itself after 1500ms', async () => {
    const onDone = jest.fn();
    await render(<TrailMoment moment={{ entryId: 'a', count: 2 }} onDone={onDone} />);
    await act(async () => { jest.advanceTimersByTime(1400); });
    expect(onDone).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(200); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('stays 2500ms at a milestone', async () => {
    const onDone = jest.fn();
    await render(<TrailMoment moment={{ entryId: 'a', count: 7, milestone: 7 }} onDone={onDone} />);
    await act(async () => { jest.advanceTimersByTime(2400); });
    expect(onDone).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(200); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('counts leaving mid-moment as done, once', async () => {
    const onDone = jest.fn();
    const view = await render(<TrailMoment moment={{ entryId: 'a', count: 2 }} onDone={onDone} />);
    await view.unmount();
    expect(onDone).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(3000); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('draws a glow normally', async () => {
    await render(<TrailMoment moment={{ entryId: 'a', count: 2 }} onDone={() => {}} />);
    expect(screen.getByTestId('trail-moment-glow')).toBeOnTheScreen();
  });

  it('has no glow under reduced motion, and still dismisses', async () => {
    reduced(true);
    const onDone = jest.fn();
    await render(<TrailMoment moment={{ entryId: 'a', count: 2 }} onDone={onDone} />);
    expect(screen.queryByTestId('trail-moment-glow')).toBeNull();
    await act(async () => { jest.advanceTimersByTime(1600); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

const captured = {} as { store: ReturnType<typeof useStore> };
const store = {
  get state() {
    return captured.store.state;
  },
  dispatch: (a: Parameters<ReturnType<typeof useStore>['dispatch']>[0]) => captured.store.dispatch(a),
};
function Capture() {
  const value = useStore();
  useEffect(() => {
    captured.store = value;
  });
  return null;
}
async function open(state: DemoState, routes: Record<string, any>, initialUrl: string) {
  function Layout() {
    return (
      <DemoStoreProvider initial={state}>
        <SnackbarProvider>
          <Capture />
          <Stack />
        </SnackbarProvider>
      </DemoStoreProvider>
    );
  }
  await renderRouter({ _layout: Layout, ...routes }, { initialUrl });
}
const withMoment = (status: 'loading' | 'none' | 'ready', patch: Partial<DemoState> = {}): DemoState => ({
  ...initialState,
  onboarded: true,
  entries: [entry('e1', 0, { reflectionStatus: status })],
  trailMoment: { entryId: 'e1', count: 5, at: Date.now() },
  ...patch,
});

describe('on the entry screen', () => {
  it('shows over a loading reflection, and dismisses at once when it is ready', async () => {
    await open(withMoment('loading'), { 'entry/[id]/index': EntryDetail }, '/entry/e1');
    expect(await screen.findByText('5 days on your way.')).toBeOnTheScreen();
    await act(async () => store.dispatch({ type: 'setReflection', id: 'e1', status: 'ready' }));
    expect(screen.queryByText('5 days on your way.')).toBeNull();
    expect(store.state.trailMoment).toBeUndefined();
  });

  it('clears the moment when the screen is left mid-moment, and it does not resurface on Today', async () => {
    await open(withMoment('loading'), { 'entry/[id]/index': EntryDetail, today: Today }, '/today');
    await act(async () => router.push('/entry/e1'));
    expect(await screen.findByText('5 days on your way.')).toBeOnTheScreen();
    await act(async () => router.back());
    expect(store.state.trailMoment).toBeUndefined();
    await act(async () => store.dispatch({ type: 'setReflection', id: 'e1', status: 'none' }));
    expect(screen.queryByText('5 days on your way.')).toBeNull();
  });

  it('paints with one haptic here, and none from the overlay on Today', async () => {
    const tap = Haptics.impactAsync as jest.Mock;
    tap.mockClear();
    await open(withMoment('loading'), { 'entry/[id]/index': EntryDetail }, '/entry/e1');
    await screen.findByText('5 days on your way.');
    expect(tap).toHaveBeenCalledTimes(1);
  });

  it('does not show another entry’s moment', async () => {
    await open(withMoment('loading', { trailMoment: { entryId: 'other', count: 5, at: Date.now() } }), { 'entry/[id]/index': EntryDetail }, '/entry/e1');
    await screen.findByText('Reflection');
    expect(screen.queryByText('5 days on your way.')).toBeNull();
  });
});

describe('on Today', () => {
  it('shows when the entry has no reflection request, and clears when skipped', async () => {
    (Haptics.impactAsync as jest.Mock).mockClear();
    await open(withMoment('none'), { today: Today }, '/today');
    expect(await screen.findByText('5 days on your way.')).toBeOnTheScreen();
    expect((Haptics.impactAsync as jest.Mock).mock.calls.length).toBe(0);
    await fireEvent.press(screen.getByLabelText('Skip'));
    expect(store.state.trailMoment).toBeUndefined();
    expect(screen.queryByText('5 days on your way.')).toBeNull();
  });

  it('does not replay a moment from a save made a while ago somewhere else', async () => {
    await open(withMoment('none', { trailMoment: { entryId: 'e1', count: 5, at: Date.now() - 60_000 } }), { today: Today }, '/today');
    await screen.findByText('Your trail');
    expect(screen.queryByText('5 days on your way.')).toBeNull();
    await waitFor(() => expect(store.state.trailMoment).toBeUndefined());
  });

  it('stays out of the way when a reflection was requested', async () => {
    await open(withMoment('loading'), { today: Today }, '/today');
    await screen.findByText('Your trail');
    expect(screen.queryByText('5 days on your way.')).toBeNull();
  });
});

describe('no moment on edit or sync', () => {
  it('updateEntry does not set one', () => {
    const s = reducer({ ...initialState, entries: [entry('a', 0)] }, { type: 'updateEntry', id: 'a', patch: { title: 'New' } });
    expect(s.trailMoment).toBeUndefined();
  });
  it('applyCloud does not set one', () => {
    const empty = emptySnapshot();
    const s = reducer(initialState, { type: 'applyCloud', base: empty, remote: empty });
    expect(s.trailMoment).toBeUndefined();
  });
});
