import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';

import type { WidgetSnapshot } from '@/widget/content';
import { saveWidgetSnapshot } from '@/widget/content';

/* eslint-disable @typescript-eslint/no-require-imports -- loaded on demand; see widgetLib */
type Lib = typeof import('react-native-android-widget');

let lib: Lib | null | undefined;

/**
 * The widget library, or null where it can't run: iOS, web, tests and Expo Go, which doesn't
 * include its native module. Loaded on first use, never at startup.
 */
export function widgetLib(): Lib | null {
  if (lib === undefined) {
    try {
      // Its JS loads anywhere, but calls throw unless the native module is in this build.
      const native = Platform.OS === 'android' && (TurboModuleRegistry.get('AndroidWidget') ?? NativeModules.AndroidWidget);
      lib = native ? (require('react-native-android-widget') as Lib) : null;
    } catch {
      lib = null;
    }
  }
  return lib;
}

/** Saves what the widget should show and redraws any widget on the home screen. */
export async function updateWidget(snapshot: WidgetSnapshot) {
  await saveWidgetSnapshot(snapshot);
  const w = widgetLib();
  if (!w) return;
  const { renderKindwayWidget } = require('@/widget/task-handler') as typeof import('@/widget/task-handler');
  const { WIDGET_NAME } = require('@/widget/kindway-widget') as typeof import('@/widget/kindway-widget');
  const drawn = await renderKindwayWidget();
  w.requestWidgetUpdate({ widgetName: WIDGET_NAME, renderWidget: () => drawn });
}

/** Asks the launcher to add the widget. False when it can't (unsupported launcher, Expo Go). */
export async function pinWidget(): Promise<boolean> {
  const w = widgetLib();
  if (!w) return false;
  const { WIDGET_NAME } = require('@/widget/kindway-widget') as typeof import('@/widget/kindway-widget');
  try {
    return await w.requestPinWidget({ widgetName: WIDGET_NAME });
  } catch {
    return false;
  }
}
