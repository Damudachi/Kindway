import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Linking, Platform, Text } from 'react-native';

import FirstEntry from '@/app/(onboarding)/first-entry';
import RemindersSetup from '@/app/(onboarding)/reminders-setup';
import Today from '@/app/(tabs)/today';
import RemindersScreen from '@/app/settings/reminders';
import { SnackbarProvider } from '@/components/feedback';
import type { Reminders } from '@/data/types';
import { applySchedule, isPaused, parseTime, pauseUntil, plan, toWeekday } from '@/services/reminders';
import { DemoStoreProvider, initialState, useStore, type DemoState } from '@/state/demo-store';
import { ReminderScheduler } from '@/state/reminders';
import { newStep } from '@/state/tomorrow';
import { widgetSnapshot } from '@/state/widget-sync';
import { entry } from '@/test-utils/entries';

jest.setTimeout(30000);
const wait = { timeout: 8000 };
const N = Notifications as jest.Mocked<typeof Notifications>;

const base: Reminders = { ...initialState.reminders, permission: 'granted', enabled: true };

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

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

  it('uses a channel that shows in the status bar without sound, replacing the old silent one', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await applySchedule(base);
    expect(N.setNotificationChannelAsync).toHaveBeenCalledWith('reminders-v2', expect.objectContaining({ importance: N.AndroidImportance.DEFAULT, sound: null, enableVibrate: false }));
    expect(N.deleteNotificationChannelAsync).toHaveBeenCalledWith('reminders');
    expect(N.scheduleNotificationAsync.mock.calls[0][0]).toMatchObject({ trigger: { channelId: 'reminders-v2' } });
  });
});

function Probe() {
  const { state } = useStore();
  const r = state.reminders;
  return <Text>{`reminders:${r.permission}|${r.enabled}|${!!r.offered}|${!!r.blockedOffered}`}</Text>;
}

async function open(initialUrl: string, state: Partial<DemoState> = {}, { scheduler = false } = {}) {
  function Layout() {
    return (
      <DemoStoreProvider initial={{ ...initialState, ...state }}>
        <SnackbarProvider>
          <Stack />
          <Probe />
          {scheduler && <ReminderScheduler />}
        </SnackbarProvider>
      </DemoStoreProvider>
    );
  }
  await renderRouter(
    {
      _layout: Layout,
      'reminders-setup': RemindersSetup,
      'settings/reminders': RemindersScreen,
      'first-entry': FirstEntry,
      today: Today,
    },
    { initialUrl },
  );
}

describe('reminders in onboarding', () => {
  // Offered last, once the first entry is written, so the question comes after something useful.
  it('saving the first entry without a reflection leads to the reminder step', async () => {
    await open('/first-entry');
    await fireEvent.changeText(await screen.findByLabelText('Journal entry', {}, wait), 'A first thought');
    await fireEvent.press(screen.getByRole('button', { name: 'Save entry' }));
    expect(await screen.findByRole('button', { name: 'Remind me' }, wait)).toBeOnTheScreen();
  });

  it('“Remind me” asks Android, switches the reminder on and finishes on Today', async () => {
    await open('/reminders-setup', { onboarded: true });
    await fireEvent.press(await screen.findByRole('button', { name: 'Remind me' }, wait));
    expect(await screen.findByText(/How are you arriving/, {}, wait)).toBeOnTheScreen();
    expect(N.requestPermissionsAsync).toHaveBeenCalled();
    expect(screen.getByText('reminders:granted|true|true|false')).toBeOnTheScreen();
  });

  it('a refusal leaves reminders off and still moves on', async () => {
    N.requestPermissionsAsync.mockResolvedValueOnce({ granted: false, canAskAgain: false, status: 'denied' } as never);
    await open('/reminders-setup', { onboarded: true });
    await fireEvent.press(await screen.findByRole('button', { name: 'Remind me' }, wait));
    expect(await screen.findByText(/How are you arriving/, {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('reminders:denied|false|true|false')).toBeOnTheScreen();
  });

  it('“No reminders” asks nothing', async () => {
    await open('/reminders-setup', { onboarded: true });
    await fireEvent.press(await screen.findByRole('button', { name: 'No reminders' }, wait));
    expect(await screen.findByText(/How are you arriving/, {}, wait)).toBeOnTheScreen();
    expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(screen.getByText('reminders:unasked|false|true|false')).toBeOnTheScreen();
  });
});

describe('reminders offered on Today', () => {
  const written = { onboarded: true, entries: [entry('a', 1)] };

  it('asks Android right there, once, and confirms', async () => {
    await open('/today', written);
    await fireEvent.press(await screen.findByRole('button', { name: 'Turn on reminders' }, wait));
    await waitFor(() => expect(screen.getByText('reminders:granted|true|true|false')).toBeOnTheScreen(), wait);
    expect(N.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Evening reminder set for 9:00 PM/, {}, wait)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Turn on reminders' })).toBeNull();
  });

  it('a refusal there isn’t followed by another ask', async () => {
    N.requestPermissionsAsync.mockResolvedValueOnce({ granted: false, canAskAgain: false, status: 'denied' } as never);
    await open('/today', written);
    await fireEvent.press(await screen.findByRole('button', { name: 'Turn on reminders' }, wait));
    await waitFor(() => expect(screen.getByText('reminders:denied|false|true|true')).toBeOnTheScreen(), wait);
    expect(screen.queryByText('Reminders can’t reach you')).toBeNull();
  });

  it('when Android blocks them, says so once and opens system settings', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    await open('/today', { ...written, reminders: { ...initialState.reminders, permission: 'denied', offered: true } });
    expect(await screen.findByText('Reminders can’t reach you', {}, wait)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Open Android settings' }));
    expect(openSettings).toHaveBeenCalled();
    expect(screen.getByText('reminders:denied|true|true|true')).toBeOnTheScreen();
    expect(screen.queryByText('Reminders can’t reach you')).toBeNull();
  });

  it('“Leave them off” hides it for good', async () => {
    await open('/today', { ...written, reminders: { ...initialState.reminders, permission: 'denied', offered: true } });
    await fireEvent.press(await screen.findByRole('button', { name: 'Leave them off' }, wait));
    expect(screen.getByText('reminders:denied|false|true|true')).toBeOnTheScreen();
    expect(screen.queryByText('Reminders can’t reach you')).toBeNull();
  });

  it('notices when notifications were allowed in Android settings', async () => {
    N.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true, status: 'granted' } as never);
    await open('/today', { ...written, reminders: { ...initialState.reminders, permission: 'denied', enabled: true, offered: true, blockedOffered: true } }, { scheduler: true });
    await waitFor(() => expect(screen.getByText('reminders:granted|true|true|true')).toBeOnTheScreen(), wait);
    N.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true, status: 'undetermined' } as never);
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
