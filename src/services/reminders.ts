import { Platform } from 'react-native';

import type { Reminders } from '@/data/types';

/**
 * Gentle reminders as local notifications on this device. Nothing goes through a server, and
 * the text never mentions entries or counts anything. The whole schedule is rebuilt from the
 * settings each time, so what's scheduled always matches what the Reminders screen shows.
 */

const CHANNEL = 'reminders-v2';
/** The first channel was low importance, which One UI files under "Silent" with no status-bar icon. Android can't raise a channel's importance, so it's replaced. */
const OLD_CHANNEL = 'reminders';

type Lib = typeof import('expo-notifications');
let lib: Lib | null | undefined;

/**
 * expo-notifications, or null where its native module is missing (Expo Go on SDK 58 lacks one
 * it loads at import). Loaded on first use, so the rest of the app still runs there.
 */
export function notifications(): Lib | null {
  if (lib === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- see above
      lib = require('expo-notifications') as Lib;
    } catch {
      lib = null;
    }
  }
  return lib;
}

/** The reminder times on offer. */
export const TIMES = ['7:00 PM', '8:00 PM', '9:00 PM', '10:00 PM'];

export const EVENING_TEXT = 'A moment for yourself is here when you need it.';
export const WEEKLY_TEXT = 'Your week is here to look back on, whenever you like.';

/** One repeating notification. `weekday` follows expo-notifications: 1 is Sunday, 7 Saturday. */
export type Planned = { kind: 'evening' | 'weekly'; weekday: number; hour: number; minute: number; body: string; url: string };

/** "9:00 PM" → 21:00. Unreadable times fall back to 9 PM. */
export function parseTime(time: string): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(time.trim());
  if (!m) return { hour: 21, minute: 0 };
  const h = Number(m[1]) % 12;
  return { hour: m[3].toUpperCase() === 'PM' ? h + 12 : h, minute: Number(m[2]) };
}

/** Kindway's days run Monday (0) to Sunday (6); expo-notifications' run Sunday (1) to Saturday (7). */
export const toWeekday = (day: number) => ((day + 1) % 7) + 1;

/** Whether reminders are paused at `now`. Only a real date counts as a pause. */
export function isPaused(r: Reminders, now = new Date()) {
  const until = r.pausedUntil && /^\d{4}-\d{2}-\d{2}T/.test(r.pausedUntil) ? new Date(r.pausedUntil) : null;
  return !!until && until.getTime() > now.getTime();
}

/** What should be scheduled for these settings: nothing unless allowed, switched on and not paused. */
export function plan(r: Reminders, now = new Date()): Planned[] {
  if (r.permission !== 'granted' || isPaused(r, now)) return [];
  const { hour, minute } = parseTime(r.time);
  const out: Planned[] = [];
  if (r.enabled) {
    r.days.forEach((on, day) => {
      if (on) out.push({ kind: 'evening', weekday: toWeekday(day), hour, minute, body: EVENING_TEXT, url: '/write' });
    });
  }
  if (r.weekly) out.push({ kind: 'weekly', weekday: toWeekday(r.weeklyDay), hour, minute, body: WEEKLY_TEXT, url: '/patterns' });
  return out;
}

async function ensureChannel(Notifications: Lib) {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Gentle reminders',
    description: 'The evening reminder and weekly look-back you chose in Kindway.',
    // Default importance shows an icon in the status bar; no sound, vibration or pop-up.
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: null,
    enableVibrate: false,
  });
  await Notifications.deleteNotificationChannelAsync(OLD_CHANNEL).catch(() => {});
}

/** Asks the system for permission. On Android 13+ the prompt needs a channel first. */
export async function askPermission(): Promise<'granted' | 'denied'> {
  const Notifications = notifications();
  if (!Notifications) return 'denied';
  await ensureChannel(Notifications);
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return 'granted';
  if (!current.canAskAgain) return 'denied';
  return (await Notifications.requestPermissionsAsync()).granted ? 'granted' : 'denied';
}

/** Whether the system still allows notifications; the user can turn them off in Android settings. */
export async function permissionGranted() {
  const Notifications = notifications();
  return !!Notifications && (await Notifications.getPermissionsAsync()).granted;
}

/** Replaces everything scheduled with the plan for these settings. */
export async function applySchedule(r: Reminders, now = new Date()) {
  const Notifications = notifications();
  if (!Notifications) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  const items = plan(r, now);
  if (items.length === 0) return;
  await ensureChannel(Notifications);
  for (const p of items) {
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Kindway', body: p.body, data: { url: p.url } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: p.weekday, hour: p.hour, minute: p.minute, channelId: CHANNEL },
    });
  }
}

/** A week from today's local midnight, as stored in `pausedUntil`. */
export function pauseUntil(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7).toISOString();
}
