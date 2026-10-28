import { Platform } from 'react-native';

/**
 * Where Kindway is running, for the few things that differ on the web (the iPhone Home Screen
 * app): no reminders or widget, and different wording. Read when called, never at module load.
 */
export function onWeb(): boolean {
  return Platform.OS === 'web';
}

/**
 * Whether this is a browser tab on an iPhone or iPad rather than the installed Home Screen app.
 * iPadOS asks for desktop sites, so an iPad reports itself as a Mac that happens to have touch.
 */
export function iosBrowserTab(userAgent: string, touchPoints: number, standalone: boolean): boolean {
  const ios = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1);
  return ios && !standalone;
}

/** iosBrowserTab for this browser; false off the web. */
export function inIosBrowserTab(): boolean {
  if (!onWeb()) return false;
  const nav = globalThis.navigator as { userAgent?: string; maxTouchPoints?: number; standalone?: boolean } | undefined;
  const standalone = nav?.standalone === true || !!globalThis.matchMedia?.('(display-mode: standalone)').matches;
  return iosBrowserTab(nav?.userAgent ?? '', nav?.maxTouchPoints ?? 0, standalone);
}
