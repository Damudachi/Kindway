import { onWeb } from '@/services/platform';

/**
 * The phone's own lock, for Kindway's app lock (Android app only): fingerprint, face or the
 * phone's PIN, pattern or password. expo-local-authentication and expo-screen-capture load on
 * first use, inside try/catch, so the web app and Jest never touch them and a missing native
 * module only makes the lock unavailable.
 */

/** How long Kindway can be away before it locks again. A quick switch to copy a link doesn't. */
export const LOCK_AFTER_MS = 60_000;

export type LockSupport = 'ready' | 'no-screen-lock' | 'unavailable';

type Auth = typeof import('expo-local-authentication');
type Capture = typeof import('expo-screen-capture');

/** The key Kindway's own screen-capture block goes under, so nothing else can lift it. */
const CAPTURE_KEY = 'app-lock';

function auth(): Auth | null {
  if (onWeb()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded lazily, see above
    return require('expo-local-authentication') as Auth;
  } catch {
    return null;
  }
}

function capture(): Capture | null {
  if (onWeb()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded lazily, see above
    return require('expo-screen-capture') as Capture;
  } catch {
    return null;
  }
}

/**
 * Whether the phone can lock Kindway. Any screen lock counts, even without a fingerprint or face:
 * the prompt falls back to the phone's PIN. (Before Android 6 a SIM lock alone can read as one;
 * Kindway doesn't run there.)
 */
export async function lockSupport(): Promise<LockSupport> {
  const lib = auth();
  if (!lib) return 'unavailable';
  try {
    const level = await lib.getEnrolledLevelAsync();
    return level === lib.SecurityLevel.NONE ? 'no-screen-lock' : 'ready';
  } catch {
    return 'unavailable';
  }
}

/** Asks the phone to confirm it's the owner. The phone's PIN is always allowed, so nobody is locked out. */
export async function authenticate(prompt: string): Promise<boolean> {
  const lib = auth();
  if (!lib) return false;
  try {
    const result = await lib.authenticateAsync({ promptMessage: prompt, cancelLabel: 'Cancel', disableDeviceFallback: false });
    return result.success;
  } catch {
    return false;
  }
}

/** Keeps Kindway blank in recent apps. On Android this also blocks screenshots (FLAG_SECURE). */
export async function hideFromRecents(on: boolean): Promise<void> {
  const lib = capture();
  if (!lib) return;
  try {
    await (on ? lib.preventScreenCaptureAsync(CAPTURE_KEY) : lib.allowScreenCaptureAsync(CAPTURE_KEY));
  } catch {
    // Nothing to undo: recents just keep showing a preview.
  }
}

export type LockService = { lockSupport: typeof lockSupport; authenticate: typeof authenticate; hideFromRecents: typeof hideFromRecents };

export const lockService: LockService = { lockSupport, authenticate, hideFromRecents };
