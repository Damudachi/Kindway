import type { NotificationResponse } from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { Dialog } from '@/components/feedback';
import type { Reminders } from '@/data/types';
import { applySchedule, askOnTime, askPermission, notifications, onTimeAllowed, permissionGranted } from '@/services/reminders';
import { useStore } from '@/state/demo-store';

// A reminder that arrives while Kindway is open would only interrupt; it stays out of sight.
notifications()?.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false }),
});

const OPENS = new Set(['/write', '/patterns']);

/**
 * Keeps this device's scheduled reminders matching the current journal's settings, and opens
 * the composer (or Patterns) when one is tapped. Rescheduled when the settings change and when
 * the app comes back, so a finished pause resumes and a permission changed in Android
 * settings shows up as blocked or allowed. Renders only the one-time on-time question.
 */
export function ReminderScheduler() {
  const { state, dispatch } = useStore();
  const r = state.reminders;
  const key = JSON.stringify(r);

  useEffect(() => {
    // Without the native module (Expo Go) there is nothing to schedule or check.
    if (!notifications()) return;
    const sync = async () => {
      // Permission can change in Android settings either way while Kindway is in the background.
      if (r.permission !== 'unasked') {
        const granted = await permissionGranted();
        if ((r.permission === 'granted') !== granted) {
          dispatch({ type: 'reminders', patch: { permission: granted ? 'granted' : 'denied' } });
          return;
        }
      }
      await applySchedule(r);
    };
    void sync().catch(() => {});
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void sync().catch(() => {});
    });
    return () => sub.remove();
    // `key` stands for `r`: rescheduling follows what the settings say, not object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, dispatch]);

  // A tap on a reminder: the one that opened the app, then any while it runs.
  const handled = useRef<string | null>(null);
  const onboarded = state.onboarded;
  useEffect(() => {
    const N = notifications();
    if (!N) return;
    const open = (response: NotificationResponse | null) => {
      if (!response || response.actionIdentifier !== N.DEFAULT_ACTION_IDENTIFIER) return;
      const id = response.notification.request.identifier + response.notification.date;
      if (handled.current === id) return;
      handled.current = id;
      const url = response.notification.request.content.data?.url;
      if (typeof url === 'string' && OPENS.has(url) && onboarded) router.push(url as Href);
    };
    void N.getLastNotificationResponseAsync().then(open).catch(() => {});
    const sub = N.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [onboarded]);

  // Once reminders are on, asks once whether they should arrive on time; without Android's
  // "Alarms & reminders" they come up to an hour late, so they're moved half an hour early.
  const onTime = useOnTime();
  const on = r.permission === 'granted' && (r.enabled || r.weekly);
  return (
    <Dialog
      visible={on && onTime === false && !r.onTimeAsked}
      title="Reminders right on time?"
      body="Without Android’s “Alarms & reminders” permission, a reminder can arrive up to an hour late. Allowing it only lets Kindway keep the time you picked."
      confirmLabel="Open settings"
      cancelLabel={`Around ${r.time} is fine`}
      onCancel={() => dispatch({ type: 'reminders', patch: { onTimeAsked: true } })}
      onConfirm={() => {
        dispatch({ type: 'reminders', patch: { onTimeAsked: true } });
        void askOnTime().catch(() => {});
      }}
    />
  );
}

/**
 * Whether Android delivers reminders on time, or null while checking. Checked again when Kindway
 * comes back, since the setting is changed outside the app.
 */
export function useOnTime() {
  const [onTime, setOnTime] = useState<boolean | null>(null);
  useEffect(() => {
    if (!notifications()) return;
    const check = () => void onTimeAllowed().then(setOnTime, () => {});
    check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => sub.remove();
  }, []);
  return onTime;
}

/**
 * Asks Android for permission, then switches on what the user chose. A refusal leaves every
 * reminder off; the Reminders screen then explains how to allow notifications in settings.
 */
export function useAllowReminders() {
  const { dispatch } = useStore();
  return useCallback(
    async (patch: Partial<Reminders>) => {
      const permission = await askPermission().catch(() => 'denied' as const);
      dispatch({ type: 'reminders', patch: permission === 'granted' ? { ...patch, permission } : { permission, enabled: false, weekly: false } });
      return permission;
    },
    [dispatch],
  );
}
