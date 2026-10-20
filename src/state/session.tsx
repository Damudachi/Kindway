import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabaseAuth, type AuthService } from '@/services/auth';
import { supabaseRepo, type CloudRepo } from '@/services/cloud/repo';
import { supabase } from '@/services/supabase/client';
import { clearAccountData, deviceSettingsStorage, type Scope, type StateStorage } from '@/storage/persistence';

/**
 * Who is signed in on this device, and whether their journal syncs here. Three states, kept
 * explicit so nobody believes entries are backed up when they aren't:
 * - `local-only`: no account; the journal is only on this device.
 * - `signed-in-local`: signed in, but cloud sync isn't on here; the journal is still local-only.
 * - `cloud-sync`: signed in with sync on; this account's own cache is shown and backed up.
 */
export type AccountMode = 'local-only' | 'signed-in-local' | 'cloud-sync';
export type AuthUser = { id: string; email: string };

export type Session = {
  /** False when the app has no Supabase project configured; accounts are then unavailable. */
  configured: boolean;
  user: AuthUser | null;
  mode: AccountMode;
  /** Which journal the app shows: the local-only one, or this account's synced cache. */
  scope: Scope;
  auth: AuthService | null;
  repo: CloudRepo | null;
  /** Switches this device to the account's synced journal. Call only after the user confirmed. */
  enableSync(): Promise<void>;
  /** Signs out on this device. The local-only journal stays; this account's cache is hidden. */
  signOut(): Promise<void>;
  /** After the server deleted the account: forget its session and its cache on this device. */
  forgetAccount(): Promise<void>;
};

type DeviceSettings = { syncUsers: string[] };

const localOnly: Session = {
  configured: false,
  user: null,
  mode: 'local-only',
  scope: 'guest',
  auth: null,
  repo: null,
  enableSync: async () => {},
  signOut: async () => {},
  forgetAccount: async () => {},
};

const SessionContext = createContext<Session>(localOnly);

type Props = {
  children: ReactNode;
  /** Test seams; the app uses the configured Supabase project. */
  auth?: AuthService | null;
  repo?: CloudRepo | null;
  /** Subscribes to sign-in changes; returns the current user first. */
  watchUser?: (onUser: (u: AuthUser | null) => void) => () => void;
  settings?: StateStorage;
};

function supabaseWatch(onUser: (u: AuthUser | null) => void) {
  if (!supabase) {
    onUser(null);
    return () => {};
  }
  const toUser = (u: { id: string; email?: string } | null | undefined) => (u ? { id: u.id, email: u.email ?? '' } : null);
  // getSession reads the stored session; the auth listener then follows refreshes and sign-outs.
  void supabase.auth.getSession().then(({ data }) => onUser(toUser(data.session?.user)));
  const { data } = supabase.auth.onAuthStateChange((_event, session) => onUser(toUser(session?.user)));
  return () => data.subscription.unsubscribe();
}

const defaultAuth = supabase ? supabaseAuth(supabase) : null;
const defaultRepo = supabase ? supabaseRepo(supabase) : null;

export function SessionProvider({ children, auth = defaultAuth, repo = defaultRepo, watchUser = supabaseWatch, settings = deviceSettingsStorage }: Props) {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [device, setDevice] = useState<DeviceSettings | null>(null);

  useEffect(() => {
    let cancelled = false;
    settings
      .load()
      .catch(() => null)
      .then((raw) => {
        if (cancelled) return;
        const syncUsers = (raw as DeviceSettings | null)?.syncUsers;
        setDevice({ syncUsers: Array.isArray(syncUsers) ? syncUsers : [] });
      });
    return () => {
      cancelled = true;
    };
  }, [settings]);

  useEffect(
    () =>
      watchUser((u) =>
        // Keep the same object while nothing changed, so token refreshes don't remount anything.
        setUser((prev) => (prev && u && prev.id === u.id && prev.email === u.email ? prev : u)),
      ),
    [watchUser],
  );

  const writeDevice = useCallback(
    async (next: DeviceSettings) => {
      await settings.save(next);
      setDevice(next);
    },
    [settings],
  );

  const value = useMemo<Session | null>(() => {
    if (user === undefined || device === null) return null;
    const syncing = !!user && device.syncUsers.includes(user.id);
    return {
      configured: !!auth,
      user,
      mode: !user ? 'local-only' : syncing ? 'cloud-sync' : 'signed-in-local',
      scope: syncing && user ? `user:${user.id}` : 'guest',
      auth,
      repo,
      enableSync: async () => {
        if (!user || device.syncUsers.includes(user.id)) return;
        await writeDevice({ syncUsers: [...device.syncUsers, user.id] });
      },
      signOut: async () => {
        await auth?.signOut();
        setUser(null);
      },
      forgetAccount: async () => {
        if (!user) return;
        await clearAccountData(user.id);
        await writeDevice({ syncUsers: device.syncUsers.filter((id) => id !== user.id) });
        await auth?.signOut();
        setUser(null);
      },
    };
  }, [user, device, auth, repo, writeDevice]);

  if (!value) return null;
  return <SessionContext value={value}>{children}</SessionContext>;
}

/** The current session. Outside a provider (tests, previews) it is local-only with no accounts. */
export function useSession() {
  return use(SessionContext);
}
