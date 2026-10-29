import AsyncStorage from '@react-native-async-storage/async-storage';

import { storeFor } from '@/storage/web-kv';

/**
 * Where the app keeps its state between launches: this device's app storage (AsyncStorage), or
 * IndexedDB in the web app (see web-kv.ts). Nothing here is encrypted by Kindway.
 *
 * Storage is partitioned by scope. The local-only journal lives under `guest`; each account
 * with cloud sync turned on gets its own `user:<id>` cache on this device, so signing in as
 * one account can never show another account's cached entries.
 */
export interface StateStorage {
  load(): Promise<unknown>;
  save(snapshot: unknown): Promise<void>;
  clear(): Promise<void>;
}

export type Scope = 'guest' | `user:${string}`;

const stateKey = (scope: Scope) => (scope === 'guest' ? 'kindway:state:v1' : `kindway:state:v1:${scope}`);

/** Keys erased on purpose; a late save from a closing screen must not write them back. */
const erased = new Set<string>();

export function jsonStorage(key: string): StateStorage {
  return {
    async load() {
      erased.delete(key);
      const raw = await (await storeFor(key)).get(key);
      return raw ? JSON.parse(raw) : null;
    },
    save: async (snapshot) => {
      if (!erased.has(key)) await (await storeFor(key)).set(key, JSON.stringify(snapshot));
    },
    clear: async () => (await storeFor(key)).remove(key),
  };
}

export const scopedStorage = (scope: Scope) => jsonStorage(stateKey(scope));

/** The local-only journal. */
export const deviceStorage = scopedStorage('guest');

/** For an account: the last state known to match the cloud, so unsent changes survive restarts. */
export const syncBaseStorage = (userId: string) => jsonStorage(`kindway:sync-base:v1:${userId}`);

/** Device-level choices that aren't part of any one journal, such as which accounts sync here. */
export const deviceSettingsStorage = jsonStorage('kindway:device:v1');

/** The web app's own choices in this browser, whichever journal is open (see state/web-prefs). */
export const webPrefsStorage = jsonStorage('kindway:web:v1');

/** Erases one journal on this device, e.g. the local-only copy after it moved to an account. */
export async function eraseScope(scope: Scope) {
  const key = stateKey(scope);
  erased.add(key);
  // From wherever it is: a key that failed to move to IndexedDB stays in localStorage.
  await Promise.all([AsyncStorage.removeItem(key), (await storeFor(key)).remove(key)]);
}

/** Removes everything this device holds for one account. The local-only journal is untouched. */
export async function clearAccountData(userId: string) {
  const keys = [stateKey(`user:${userId}`), `kindway:sync-base:v1:${userId}`];
  keys.forEach((k) => erased.add(k));
  await Promise.all([AsyncStorage.multiRemove(keys), ...keys.map(async (k) => (await storeFor(k)).remove(k))]);
}

/** In-memory storage for tests and previews. */
export function memoryStorage(initial: unknown = null): StateStorage & { current: unknown } {
  const store = {
    current: initial,
    async load() {
      return store.current;
    },
    async save(snapshot: unknown) {
      store.current = JSON.parse(JSON.stringify(snapshot));
    },
    async clear() {
      store.current = null;
    },
  };
  return store;
}
