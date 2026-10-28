import { useCallback, useEffect, useState } from 'react';

import { webPrefsStorage } from '@/storage/persistence';

/** The web app's choices in this browser, shared by every journal opened in it. */
export type WebPrefs = {
  /** The Home Screen tip was dismissed; it isn't shown again in this browser. */
  installTipDone?: boolean;
  /** When the backup nudge was last put off. */
  backupNudgeAt?: string;
};

/**
 * The web app's stored choices, or null while they load (cards wait rather than flash). Each
 * change is merged into what's stored, so two cards changing different choices don't undo each
 * other.
 */
export function useWebPrefs(): [WebPrefs | null, (patch: Partial<WebPrefs>) => void] {
  const [prefs, setPrefs] = useState<WebPrefs | null>(null);
  useEffect(() => {
    let live = true;
    void webPrefsStorage
      .load()
      .catch(() => null)
      .then((raw) => live && setPrefs(raw && typeof raw === 'object' ? (raw as WebPrefs) : {}));
    return () => {
      live = false;
    };
  }, []);
  const update = useCallback((patch: Partial<WebPrefs>) => {
    setPrefs((p) => ({ ...p, ...patch }));
    void webPrefsStorage
      .load()
      .catch(() => null)
      .then((raw) => webPrefsStorage.save({ ...(raw && typeof raw === 'object' ? raw : {}), ...patch }))
      .catch(() => {});
  }, []);
  return [prefs, update];
}
