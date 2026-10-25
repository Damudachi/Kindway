import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';

import RemindersSetup from '@/app/(onboarding)/reminders-setup';
import RemindersScreen from '@/app/settings/reminders';
import { SnackbarProvider } from '@/components/feedback';
import type { Reminders } from '@/data/types';
import { applySchedule, isPaused, parseTime, pauseUntil, plan, toWeekday } from '@/services/reminders';
import { DemoStoreProvider, initialState, useStore, type DemoState } from '@/state/demo-store';
import { newStep } from '@/state/tomorrow';
import { widgetSnapshot } from '@/state/widget-sync';

jest.setTimeout(30000);
const wait = { timeout: 8000 };
const N = Notifications as jest.Mocked<typeof Notifications>;

const base: Reminders = { ...initialState.reminders, permission: 'granted', enabled: true };

beforeEach(() => jest.clearAllMocks());

describe('reminder schedule', () => {
  it('reads times and maps Monday-first days to expo’s Sunday-first weekdays', () => {
    expect(parseTime('9:00 PM')).toEqual({ hour: 21, minute: 0 });
    expect(parseTime('12:30 AM')).toEqual({ hour: 0, minute: 30 });
    expect(parseTime('nonsense')).toEqual({ hour: 21, minute: 0 });
    expect([0, 5, 6].map(toWeekday)).toEqual([2, 7, 1]);
  });

  it('plans one evening reminder per chosen day, plus the weekly look-back', () => {
    const p = plan({ ...base, time: '8:00 PM', days: [true, false, false, false, false, false, true], weekly: true, weeklyDay: 6 });
    expect(p.map((x) => [x.kind, x.weekday, x.hour, x.url])).toEqual([
      ['evening', 2, 20, '/write'],
      ['evening', 1, 20, '/write'],
      ['weekly', 1, 20, '/patterns'],
    ]);
  });

  it('plans nothing without permission, when off, or while paused; an old placeholder pause doesn’t count', () => {
    const at = new Date(2026, 9, 25, 12);
    expect(plan({ ...base, permission: 'unasked' })).toEqual([]);
    expect(plan({ ...base, enabled: false })).toEqual([]);
    expect(plan({ ...base, pausedUntil: pauseUntil(at) }, at)).toEqual([]);
    expect(plan({ ...base, pausedUntil: pauseUntil(at) }, new Date(2026, 10, 2))).not.toEqual([]);
    expect(isPaused({ ...base, pausedUntil: 'Oct 24' }, at)).toBe(false);
  });

  it('replaces whatever was scheduled before', async () => {
    await applySchedule({ ...base, days: [true, true, false, false, false, false, false] });
    expect(N.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(N.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    expect(N.scheduleNotificationAsync.mock.calls[0][0]).toMatchObject({
      content: { title: 'Kindway', body: 'A moment for yourself is here when you need it.', data: { url: '/write' } },
      trigger: { type: 'weekly', weekday: 2, hour: 21, minute: 0 },
    });
    await applySchedule({ ...base, enabled: false });
    expect(N.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  });
});

function Probe() {
  const { state } = useStore();
  const r = state.reminders;
  return <Text>{`reminders:${r.permission}|${r.enabled}|${!!r.offered}`}</Text>;
}

async function open(initialUrl: string, state: Partial<DemoState> = {}) {
  function Layout() {
    return (
      <DemoStoreProvider initial={{ ...initialState, ...state }}>
        <SnackbarProvider>
          <Stack />
          <Probe />
        </SnackbarProvider>
      </DemoStoreProvider>
    );
  }
  await renderRouter({ _layout: Layout, 'reminders-setup': RemindersSetup, 'settings/reminders': RemindersScreen, 'first-entry': () => <Text>First entry</Text> }, { initialUrl });
}

describe('reminders in onboarding', () => {
  it('“Remind me” asks Android, switches the reminder on and moves to the first entry', async () => {
    await open('/reminders-setup');
    await fireEvent.press(await screen.findByRole('button', { name: 'Remind me' }, wait));
    expect(await screen.findByText('First entry', {}, wait)).toBeOnTheScreen();
    expect(N.requestPermissionsAsync).toHaveBeenCalled();
    expect(screen.getByText('reminders:granted|true|true')).toBeOnTheScreen();
  });

  it('a refusal leaves reminders off and still moves on', async () => {
    N.requestPermissionsAsync.mockResolvedValueOnce({ granted: false, canAskAgain: false, status: 'denied' } as never);
    await open('/reminders-setup');
    await fireEvent.press(await screen.findByRole('button', { name: 'Remind me' }, wait));
    expect(await screen.findByText('First entry', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('reminders:denied|false|true')).toBeOnTheScreen();
  });

  it('“No reminders” asks nothing', async () => {
    await open('/reminders-setup');
    await fireEvent.press(await screen.findByRole('button', { name: 'No reminders' }, wait));
    expect(await screen.findByText('First entry', {}, wait)).toBeOnTheScreen();
    expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(screen.getByText('reminders:unasked|false|true')).toBeOnTheScreen();
  });
});

describe('reminders in settings', () => {
  it('explains first, then asks Android only after Continue', async () => {
    await open('/settings/reminders');
    await fireEvent.press(await screen.findByRole('switch', { name: /^Evening reminder/ }, wait));
    expect(await screen.findByText('Allow notifications?', {}, wait)).toBeOnTheScreen();
    expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.getByText(/reminders:granted\|true/)).toBeOnTheScreen(), wait);
  });
});

describe('widget content', () => {
  const at = new Date(2026, 9, 25, 12);
  it('shows an open step only when allowed, and never a done or dismissed one', () => {
    const step = newStep('Fictional: ten minutes on the hard part', undefined, at);
    expect(widgetSnapshot(step, true, at)).toEqual({ step: 'Fictional: ten minutes on the hard part', stepDue: 'tomorrow' });
    expect(widgetSnapshot(step, true, new Date(2026, 9, 26, 9))).toMatchObject({ stepDue: 'today' });
    expect(widgetSnapshot(step, false, at)).toEqual({ step: null, stepDue: null });
    expect(widgetSnapshot({ ...step, status: 'dismissed' }, true, at)).toEqual({ step: null, stepDue: null });
    expect(widgetSnapshot(null, true, at)).toEqual({ step: null, stepDue: null });
  });
});
