import AsyncStorage from '@react-native-async-storage/async-storage';

import { HOME_PROMPTS } from '@/data/sample';

/**
 * What the home-screen widget shows. The widget is drawn in the background, without the app's
 * state, so the app saves this small snapshot for it: only the open Tomorrow Bridge step, and
 * only when the user allows it. Entry text is never part of it.
 */
export type WidgetSnapshot = { step: string | null; stepDue: 'today' | 'tomorrow' | null };

const KEY = 'kindway:widget:v1';
const EMPTY: WidgetSnapshot = { step: null, stepDue: null };

export async function saveWidgetSnapshot(s: WidgetSnapshot) {
  await AsyncStorage.setItem(KEY, JSON.stringify(s));
}

export async function loadWidgetSnapshot(): Promise<WidgetSnapshot> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as Partial<WidgetSnapshot>) : null;
    return s && typeof s.step === 'string' && (s.stepDue === 'today' || s.stepDue === 'tomorrow') ? { step: s.step, stepDue: s.stepDue } : EMPTY;
  } catch {
    return EMPTY;
  }
}

/** The same prompt Today shows on this date. */
export const promptFor = (at = new Date()) => HOME_PROMPTS[at.getDate() % HOME_PROMPTS.length];
