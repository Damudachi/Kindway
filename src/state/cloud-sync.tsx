import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useSnackbar } from '@/components/feedback';
import type { AiOutputsRepo } from '@/services/ai/remote';
import { changeCount, diff, emptySnapshot, toCloud, type CloudSnapshot } from '@/services/cloud/records';
import { CloudError, type CloudRepo } from '@/services/cloud/repo';
import { onWeb } from '@/services/platform';
import { useStore, type DemoState } from '@/state/demo-store';
import { syncBaseStorage, type StateStorage } from '@/storage/persistence';

/**
 * Keeps one account's journal and its cloud copy in step. Screens keep dispatching to the
 * store as before; this watches the result, writes changed records to the cloud, and brings
 * in changes from other devices when the app opens or comes back to the foreground.
 *
 * Status is honest: `synced` only after the cloud confirmed every write. While a write is
 * pending or has failed, the changes stay safely on this device and are retried.
 */
export type SyncStatus = 'connecting' | 'syncing' | 'synced' | 'offline' | 'error' | 'signed-out';
export type SyncInfo = {
  status: SyncStatus;
  pending: number;
  retry(): void;
  /**
   * Pull down to refresh: reads the account's cloud copy again now, keeping anything changed here
   * that isn't confirmed yet, then sends this device's changes. Resolves once that pull has
   * finished or failed (the status says which); it never rejects.
   */
  refresh(): Promise<void>;
  /**
   * Resolves true once the cloud has confirmed these entries with exactly this text, and this
   * device's AI context choices (profile, compass, entry links), pushing pending changes first.
   * Real AI reads all of these from the account, so it waits for this.
   */
  ensureSynced(entries: { id: string; body: string }[]): Promise<boolean>;
  /** False until the account's cloud copy has been read once on this device since it opened; the
   * account's onboarding state may be waiting on it. Left out by stand-ins that don't track it. */
  loaded?: boolean;
  /** The server's code for the last failure, safe to show so a problem can be reported. */
  errorCode?: string;
};

/** Exported for tests that stand in for cloud backup. */
export const SyncContext = createContext<SyncInfo | null>(null);

const RETRY_MS = [5_000, 15_000, 60_000];
const ENSURE_POLL_MS = 400;
const ENSURE_TRIES = 25;
const DEBOUNCE_MS = 800;

type Props = {
  userId: string;
  repo: CloudRepo;
  /** Where the account's AI reflections are read from; they're brought in with each pull. */
  aiOutputs?: AiOutputsRepo | null;
  children: ReactNode;
  baseStorage?: StateStorage;
};

export function CloudSync({ userId, repo, aiOutputs = null, children, baseStorage }: Props) {
  const { state, dispatch } = useStore();
  const storage = useMemo(() => baseStorage ?? syncBaseStorage(userId), [baseStorage, userId]);
  const [status, setStatus] = useState<SyncStatus>('connecting');
  const [pending, setPending] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [errorCode, setErrorCode] = useState<string>();
  const base = useRef<CloudSnapshot | null>(null);
  const latest = useRef(state);
  const busy = useRef(false);
  const again = useRef(false);
  const pulled = useRef(false);
  const merging = useRef(false);
  /** The account's AI reflections still need reading after the last pull. */
  const aiStale = useRef(!!aiOutputs);
  const attempt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  /** Lets a pass schedule the next one. */
  const runAgain = useRef<() => void>(() => {});
  /** Counts refresh requests, so a pull that started before one doesn't count as its answer. */
  const asked = useRef(0);
  /** Refreshes waiting for a pull, with the request each one is. */
  const waiting = useRef<{ ask: number; done: () => void }[]>([]);

  useEffect(() => {
    latest.current = state;
  }, [state]);

  const fail = useCallback((e: unknown) => {
    setErrorCode(e instanceof CloudError ? e.code : undefined);
    setStatus(e instanceof CloudError ? (e.kind === 'offline' ? 'offline' : e.kind === 'auth' ? 'signed-out' : 'error') : 'error');
  }, []);

  const schedule = useCallback((run: () => void, ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(run, ms);
  }, []);

  // One pass: bring in the cloud copy if we haven't yet, then send what changed here.
  const sync = useCallback(async () => {
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    /** The newest refresh this pass's pull answers, if it pulls. */
    let answers: number | null = null;
    try {
      if (!base.current) base.current = ((await storage.load().catch(() => null)) as CloudSnapshot | null) ?? emptySnapshot();
      if (!pulled.current) {
        answers = asked.current;
        const remote = await repo.pull(userId);
        if (!alive.current) return;
        const before = base.current;
        base.current = remote;
        // A refresh asked for while this pull was out still gets a pull of its own.
        pulled.current = asked.current === answers;
        merging.current = true;
        dispatch({ type: 'applyCloud', base: before, remote });
        setLoaded(true);
        await storage.save(remote);
        again.current = true;
        return;
      }
      // Until the merged state has rendered, `latest` is from before the merge; diffing it
      // would undo changes that just came in. The effect below runs us again once it lands.
      if (merging.current) return;
      const next = toCloud(latest.current);
      const changes = diff(base.current, next);
      const n = changeCount(changes);
      setPending(n);
      if (n > 0) {
        setStatus('syncing');
        await repo.push(userId, changes);
        if (!alive.current) return;
        base.current = next;
        await storage.save(next);
      }
      // AI reflections live in their own table and only ever come from the server, so they are
      // read, never pushed. Read after the journal so every entry they belong to is here.
      if (aiOutputs && aiStale.current) {
        const known = latest.current.entries.flatMap((e) => (e.reflection?.ai ? [e.reflection.ai.id] : []));
        const reflections = await aiOutputs.reflections(userId);
        if (!alive.current) return;
        aiStale.current = false;
        dispatch({ type: 'applyAiReflections', reflections, known });
      }
      attempt.current = 0;
      setPending(0);
      setErrorCode(undefined);
      setStatus('synced');
    } catch (e) {
      if (!alive.current) return;
      fail(e);
      const ms = RETRY_MS[Math.min(attempt.current++, RETRY_MS.length - 1)];
      if (!(e instanceof CloudError && e.kind === 'auth')) schedule(() => runAgain.current(), ms);
    } finally {
      busy.current = false;
      if (answers !== null) {
        const ask = answers;
        const done = waiting.current.filter((w) => w.ask <= ask);
        waiting.current = waiting.current.filter((w) => w.ask > ask);
        for (const w of done) w.done();
      }
      if (again.current && alive.current) {
        again.current = false;
        schedule(() => runAgain.current(), 0);
      }
    }
  }, [aiOutputs, dispatch, fail, repo, schedule, storage, userId]);
  useEffect(() => {
    runAgain.current = () => void sync();
  }, [sync]);

  useEffect(() => {
    alive.current = true;
    // On mount sync() first awaits the stored base copy, so it never sets state synchronously here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void sync();
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      // Coming back: look for changes from other devices first.
      pulled.current = false;
      aiStale.current = !!aiOutputs;
      setStatus('connecting');
      void sync();
    });
    return () => {
      alive.current = false;
      sub.remove();
      if (timer.current) clearTimeout(timer.current);
    };
    // Starts once per account; `sync` is stable for a given account.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Local changes: send them shortly after they settle.
  useEffect(() => {
    merging.current = false;
    if (!pulled.current || !base.current) return;
    const n = changeCount(diff(base.current, toCloud(state)));
    setPending(n);
    if (n > 0) schedule(() => void sync(), DEBOUNCE_MS);
    else if (aiStale.current) schedule(() => void sync(), 0);
    else if (!busy.current) setStatus('synced');
  }, [state, schedule, sync]);

  const retry = useCallback(() => {
    attempt.current = 0;
    if (!pulled.current) setStatus('connecting');
    void sync();
  }, [sync]);

  // An unsent change survives the pull: the merge keeps anything that differs from the last
  // confirmed copy, and the next pass sends it. If a pass is running, the pull follows it.
  const refresh = useCallback(() => {
    const ask = ++asked.current;
    pulled.current = false;
    aiStale.current = !!aiOutputs;
    attempt.current = 0;
    return new Promise<void>((done) => {
      waiting.current.push({ ask, done });
      void sync();
    });
  }, [aiOutputs, sync]);

  const ensureSynced = useCallback(
    async (want: { id: string; body: string }[]) => {
      for (let i = 0; i < ENSURE_TRIES && alive.current; i++) {
        const confirmed = base.current;
        if (pulled.current && confirmed && want.every((w) => confirmed.entries[w.id]?.body === w.body) && contextSettled(confirmed, latest.current)) return true;
        void sync();
        await new Promise((resolve) => setTimeout(resolve, ENSURE_POLL_MS));
      }
      return false;
    },
    [sync],
  );

  const value = useMemo(
    () => ({ status, pending, retry, refresh, ensureSynced, loaded, errorCode }),
    [status, pending, retry, refresh, ensureSynced, loaded, errorCode],
  );
  return <SyncContext value={value}>{children}</SyncContext>;
}

/**
 * Whether the account already has this device's AI context choices: the profile (what
 * reflections can see, whether reviews count compass links), the compass values with their
 * "AI may use this" switches, and which entries link to them. The server applies the account's
 * copy, so a change made here must reach it before AI runs, or the old choice would apply.
 */
function contextSettled(confirmed: CloudSnapshot, state: DemoState) {
  const c = diff(confirmed, toCloud(state));
  return !c.profile && [c.upserts.compass, c.upserts.links, c.deletes.compass, c.deletes.links].every((rows) => rows.length === 0);
}

/** Cloud sync status, or null when this journal is local-only. */
export function useSync() {
  return use(SyncContext);
}

/** What each status means, in the words Settings and pull to refresh use. */
export const SYNC_TEXT: Record<SyncStatus, string> = {
  connecting: 'Connecting to your account…',
  syncing: 'Backing up changes…',
  synced: 'All changes are backed up to your account.',
  offline: 'Offline. Changes are saved on this device and will back up when you’re online.',
  error: 'Some changes haven’t backed up yet. They’re safe on this device.',
  'signed-out': 'Your session ended. Sign in again to keep backing up; changes stay on this device.',
};

/**
 * Pull down to refresh for Journal and Today: a sync now, or nothing for a local-only journal and
 * on the web. A pull that couldn't reach the account says so in a snackbar once it settles.
 */
export function usePullToRefresh(): (() => Promise<void>) | undefined {
  const sync = useSync();
  const show = useSnackbar();
  const [settled, setSettled] = useState(0);
  // Set when a refresh settles; the status it ended with has rendered by the time the effect runs.
  const check = useRef(false);
  const status = sync?.status;
  const refresh = sync?.refresh;

  useEffect(() => {
    if (!check.current) return;
    check.current = false;
    if (status === 'offline' || status === 'error') show({ message: SYNC_TEXT[status] });
  }, [settled, status, show]);

  const pull = useCallback(async () => {
    if (!refresh) return;
    await refresh();
    check.current = true;
    setSettled((n) => n + 1);
  }, [refresh]);

  return refresh && !onWeb() ? pull : undefined;
}
