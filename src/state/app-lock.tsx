import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Keyboard, StyleSheet, View } from 'react-native';
import Animated, { FadeOut, useReducedMotion } from 'react-native-reanimated';

import { HeldLight } from '@/components/brand';
import { Button } from '@/components/button';
import { LockCoverContext, useSnackbar } from '@/components/feedback';
import { Text } from '@/components/text';
import { LOCK_AFTER_MS, lockService as defaultService, type LockService } from '@/services/app-lock';
import { onWeb } from '@/services/platform';
import { appLockStorage, type StateStorage } from '@/storage/persistence';
import { makeStyles } from '@/theme/theme';
import { space } from '@/theme/tokens';

/**
 * App lock (Android app only): fingerprint, face or the phone's own PIN to open Kindway. It
 * covers every journal, so it sits above the session in the root layout. It locks when the app
 * starts and when it comes back after at least a minute away, and keeps Kindway blank in recent
 * apps while it's on. While Kindway is away it hides behind a plain cover, so its last frame
 * never shows on the way back. The setting belongs to this device and is never synced.
 */
export type SetLockResult = 'ok' | 'no-screen-lock' | 'failed';

/** `locked` is true whenever the cover is up, including while the setting loads. */
export type AppLockInfo = { enabled: boolean; locked: boolean; setEnabled(on: boolean): Promise<SetLockResult> };

type Context = AppLockInfo & { notice: string | null; clearNotice(): void };

/** Outside an AppLock (a screen rendered on its own in tests) there's no lock to turn on. */
const none: Context = { enabled: false, locked: false, setEnabled: async () => 'failed', notice: null, clearNotice: () => {} };

const AppLockContext = createContext<Context>(none);

export const LOST_LOCK = 'App lock is off because this phone no longer has a screen lock.';

/** The part of React Native's AppState the lock listens to; a test seam. */
export type AppStateLike = Pick<typeof AppState, 'addEventListener' | 'currentState'>;

type Props = { children: ReactNode; storage?: StateStorage; lockService?: LockService; appState?: AppStateLike };

export function AppLock({ children, storage = appLockStorage, lockService = defaultService, appState = AppState }: Props) {
  const styles = useStyles();
  const reduce = useReducedMotion();
  // null until the saved setting is read. Until then a plain cover shows, so no journal flashes on
  // a cold start. The web app has no lock at all.
  const [enabled, setEnabledState] = useState<boolean | null>(() => (onWeb() ? false : null));
  const [locked, setLocked] = useState(() => !onWeb());
  // The plain cover while Kindway is in the background: no prompt, gone again on a quick return.
  const [away, setAway] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // While the phone's prompt is up. Its PIN screen pauses Kindway, which must not count as leaving.
  const busy = useRef(false);
  const leftAt = useRef<number | null>(null);
  const asked = useRef(false);
  // The saved setting couldn't be read: locked for this session, and nothing is saved over it.
  const unreadable = useRef(false);

  useEffect(() => {
    if (onWeb()) return;
    let cancelled = false;
    storage
      .load()
      .then(
        (raw) => (raw as { enabled?: unknown } | null)?.enabled === true,
        () => {
          // Fails closed: a setting that can't be read might be "on".
          unreadable.current = true;
          return true;
        },
      )
      .then((on) => {
        if (cancelled) return;
        setEnabledState(on);
        // The recents block doesn't survive a restart, so it's set again on every launch.
        if (on) void lockService.hideFromRecents(true);
        else setLocked(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storage, lockService]);

  /** Runs one prompt at a time; time spent in it never counts as time away. */
  const guarded = useCallback(async <T,>(run: () => Promise<T>, whenBusy: T) => {
    if (busy.current) return whenBusy;
    busy.current = true;
    try {
      return await run();
    } finally {
      busy.current = false;
      // Left while the prompt was up (it was cancelled by going Home, say): away starts now.
      if (appState.currentState === 'background') {
        leftAt.current = Date.now();
        setAway(true);
      } else {
        leftAt.current = null;
      }
    }
  }, [appState]);

  const save = useCallback(
    async (on: boolean) => {
      unreadable.current = false;
      setAway(false);
      setEnabledState(on);
      await storage.save({ enabled: on }).catch(() => {});
      await lockService.hideFromRecents(on);
    },
    [storage, lockService],
  );

  const unlock = useCallback(
    () =>
      guarded(async () => {
        const support = await lockService.lockSupport();
        if (support === 'no-screen-lock' && unreadable.current) {
          // Nothing to unlock with, and nothing known to turn off.
          setLocked(false);
          return;
        }
        if (support === 'no-screen-lock') {
          // The phone's lock was removed, which took unlocking the phone. Say so once and step aside.
          await save(false);
          setLocked(false);
          setNotice(LOST_LOCK);
          return;
        }
        // Without the native module there's nothing to unlock with; never shut someone out of their journal.
        if (support === 'unavailable' || (await lockService.authenticate('Unlock Kindway'))) setLocked(false);
      }, undefined),
    [guarded, lockService, save],
  );

  // Asks once by itself each time the lock appears; after that, the Unlock button asks again.
  useEffect(() => {
    if (!locked || enabled !== true) {
      asked.current = false;
      return;
    }
    if (asked.current) return;
    asked.current = true;
    void unlock();
  }, [locked, enabled, unlock]);

  // Typing mustn't go on into a composer hidden under the lock.
  useEffect(() => {
    if (locked) Keyboard.dismiss();
  }, [locked]);

  // Only 'background' counts as leaving; iOS's 'inactive' (the app switcher) and Android's rare one don't.
  useEffect(() => {
    if (!enabled) return;
    const sub = appState.addEventListener('change', (next) => {
      if (next === 'background') {
        if (busy.current) return;
        leftAt.current = Date.now();
        setAway(true);
      } else if (next === 'active') {
        const since = leftAt.current;
        leftAt.current = null;
        // A minute or more turns the plain cover into the lock; a quick switch just lifts it.
        if (since !== null && Date.now() - since >= LOCK_AFTER_MS) setLocked(true);
        setAway(false);
      }
    });
    return () => sub.remove();
  }, [enabled, appState]);

  const setEnabled = useCallback(
    (on: boolean) =>
      guarded<SetLockResult>(async () => {
        const support = await lockService.lockSupport();
        if (on) {
          if (support === 'no-screen-lock') return 'no-screen-lock';
          // Proven to work before it's saved.
          if (support === 'unavailable' || !(await lockService.authenticate('Turn on app lock'))) return 'failed';
        } else if (support === 'ready' && !(await lockService.authenticate('Turn off app lock'))) {
          return 'failed';
        }
        await save(on);
        return 'ok';
      }, 'failed'),
    [guarded, lockService, save],
  );

  const clearNotice = useCallback(() => setNotice(null), []);
  const covered = locked || (away && enabled === true);
  const value = useMemo<Context>(() => ({ enabled: enabled === true, locked: covered, setEnabled, notice, clearNotice }), [enabled, covered, setEnabled, notice, clearNotice]);

  return (
    <AppLockContext value={value}>
      {/* Dialogs are their own windows above this one; they wait, still open, until the cover lifts. */}
      <LockCoverContext value={covered}>
        <View style={styles.fill}>
          {/* Screens (and deep links) load underneath, hidden from TalkBack until unlocked. */}
          <View style={styles.fill} importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={covered}>
            {children}
          </View>
          {covered && (
            // Opaque from its first frame; only leaving fades, and not under reduced motion. A cover
            // that was only waiting for the setting just goes: the lock was off all along.
            <Animated.View exiting={reduce || enabled === null ? undefined : FadeOut.duration(200)} style={styles.cover} accessibilityViewIsModal testID="lock-cover">
              <HeldLight size={64} />
              {/* Until the setting is read it's a plain cover: the lock may well be off. */}
              {locked && enabled !== null && (
                <>
                  <Text variant="headline" accessibilityRole="header" style={styles.headline}>
                    Kindway is locked
                  </Text>
                  <Button label="Unlock Kindway" icon="lock-open-outline" onPress={() => enabled && void unlock()} />
                </>
              )}
            </Animated.View>
          )}
        </View>
      </LockCoverContext>
    </AppLockContext>
  );
}

export function useAppLock(): AppLockInfo {
  const { enabled, locked, setEnabled } = use(AppLockContext);
  return { enabled, locked, setEnabled };
}

/**
 * Says once that app lock turned itself off. Mounted inside the SnackbarProvider, which sits
 * below AppLock (each journal has its own), so the message waits here until a snackbar can show it.
 */
export function AppLockNotice() {
  const { notice, clearNotice } = use(AppLockContext);
  const show = useSnackbar();
  useEffect(() => {
    if (!notice) return;
    show({ message: notice });
    clearNotice();
  }, [notice, show, clearNotice]);
  return null;
}

const useStyles = makeStyles((color) => ({
  fill: { flex: 1 },
  cover: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: color.paper,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.gutter,
    gap: space.lg,
  },
  headline: { textAlign: 'center' },
}));
