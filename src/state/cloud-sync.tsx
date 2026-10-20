import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { changeCount, diff, emptySnapshot, toCloud, type CloudSnapshot } from '@/services/cloud/records';
import { CloudError, type CloudRepo } from '@/services/cloud/repo';
import { useStore } from '@/state/demo-store';
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
   * Resolves true once the cloud has confirmed these entries with exactly this text, pushing
   * pending changes first. Real AI reads entries from the account, so it waits for this.
   */
  ensureSynced(entries: { id: string; body: string }[]): Promise<boolean>;
};

/** Exported for tests that stand in for cloud backup. */
export const SyncContext = createContext<SyncInfo | null>(null);

const RETRY_MS = [5_000, 15_000, 60_000];
const ENSURE_POLL_MS = 400;
const ENSURE_TRIES = 25;
const DEBOUNCE_MS = 800;

type Props = { userId: string; repo: CloudRepo; children: ReactNode; baseStorage?: StateStorage };

export function CloudSync({ userId, repo, children, baseStorage }: Props) {
  const { state, dispatch } = useStore();
  const storage = useMemo(() => baseStorage ?? syncBaseStorage(userId), [baseStorage, userId]);
  const [status, setStatus] = useState<SyncStatus>('connecting');
  const [pending, setPending] = useState(0);
  const base = useRef<CloudSnapshot | null>(null);
  const latest = useRef(state);
  const busy = useRef(false);
  const again = useRef(false);
  const pulled = useRef(false);
  const merging = useRef(false);
  const attempt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  /** Lets a pass schedule the next one. */
  const runAgain = useRef<() => void>(() => {});

  useEffect(() => {
    latest.current = state;
  }, [state]);

  const fail = useCallback((e: unknown) => {
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
    try {
      if (!base.current) base.current = ((await storage.load().catch(() => null)) as CloudSnapshot | null) ?? emptySnapshot();
      if (!pulled.current) {
        const remote = await repo.pull(userId);
        if (!alive.current) return;
        const before = base.current;
        base.current = remote;
        pulled.current = true;
        merging.current = true;
        dispatch({ type: 'applyCloud', base: before, remote });
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
      attempt.current = 0;
      setPending(0);
      setStatus('synced');
    } catch (e) {
      if (!alive.current) return;
      fail(e);
      const ms = RETRY_MS[Math.min(attempt.current++, RETRY_MS.length - 1)];
      if (!(e instanceof CloudError && e.kind === 'auth')) schedule(() => runAgain.current(), ms);
    } finally {
      busy.current = false;
      if (again.current && alive.current) {
        again.current = false;
        schedule(() => runAgain.current(), 0);
      }
    }
  }, [dispatch, fail, repo, schedule, storage, userId]);
  useEffect(() => {
    runAgain.current = () => void sync();
  }, [sync]);

  useEffect(() => {
    alive.current = true;
    void sync();
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      // Coming back: look for changes from other devices first.
      pulled.current = false;
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
    else if (!busy.current) setStatus('synced');
  }, [state, schedule, sync]);

  const retry = useCallback(() => {
    attempt.current = 0;
    if (!pulled.current) setStatus('connecting');
    void sync();
  }, [sync]);

  const ensureSynced = useCallback(
    async (want: { id: string; body: string }[]) => {
      for (let i = 0; i < ENSURE_TRIES && alive.current; i++) {
        const confirmed = base.current;
        if (pulled.current && confirmed && want.every((w) => confirmed.entries[w.id]?.body === w.body)) return true;
        void sync();
        await new Promise((resolve) => setTimeout(resolve, ENSURE_POLL_MS));
      }
      return false;
    },
    [sync],
  );

  const value = useMemo(() => ({ status, pending, retry, ensureSynced }), [status, pending, retry, ensureSynced]);
  return <SyncContext value={value}>{children}</SyncContext>;
}

/** Cloud sync status, or null when this journal is local-only. */
export function useSync() {
  return use(SyncContext);
}
