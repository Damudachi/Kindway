import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { onWeb } from '@/services/platform';

/** The parts of the browser's service worker API used here. */
type Waiting = { postMessage(message: unknown): void };
type Registration = {
  waiting: Waiting | null;
  installing: (Waiting & { state: string; addEventListener(type: 'statechange', fn: () => void): void }) | null;
  update(): Promise<unknown>;
  addEventListener(type: 'updatefound', fn: () => void): void;
  removeEventListener(type: 'updatefound', fn: () => void): void;
};
type Container = {
  controller: unknown;
  getRegistration(): Promise<Registration | undefined>;
  addEventListener(type: 'controllerchange', fn: () => void): void;
};

const container = () => (onWeb() ? ((globalThis.navigator as { serviceWorker?: Container } | undefined)?.serviceWorker ?? null) : null);

/**
 * Whether a new version of the web app is installed and waiting. The service worker never takes
 * over by itself (see workbox-config.js), so the new version opens on the next start; `restart`
 * switches now and reloads once the new worker is in charge. Looks for updates again whenever
 * the app comes back to the foreground. Off the web it's never ready.
 */
export function useUpdateReady(): { ready: boolean; restart(): void } {
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  // Restart now was pressed; once is enough, since the page reloads when the new version takes over.
  const restarting = useRef(false);

  useEffect(() => {
    const sw = container();
    if (!sw) return;
    let reg: Registration | undefined;
    let live = true;
    // Only an update: the very first install has no controller and nothing to replace.
    const check = () => {
      if (live && reg?.waiting && sw.controller) setWaiting(reg.waiting);
    };
    const found = () => {
      const next = reg?.installing;
      next?.addEventListener('statechange', () => next.state === 'installed' && check());
    };
    void sw
      .getRegistration()
      .then((r) => {
        reg = r;
        if (!live || !r) return;
        check();
        r.addEventListener('updatefound', found);
      })
      .catch(() => {});
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void reg?.update().catch(() => {});
    });
    return () => {
      live = false;
      sub.remove();
      reg?.removeEventListener('updatefound', found);
    };
  }, []);

  const restart = useCallback(() => {
    const sw = container();
    if (!waiting || !sw || restarting.current) return;
    restarting.current = true;
    let reloaded = false;
    sw.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      globalThis.location.reload();
    });
    waiting.postMessage({ type: 'SKIP_WAITING' });
  }, [waiting]);

  return { ready: !!waiting, restart };
}
