import AsyncStorage from '@react-native-async-storage/async-storage';

import { onWeb } from '@/services/platform';

/**
 * Where saved state lives. Native: AsyncStorage. Web: IndexedDB, which has far more room than
 * localStorage (about 5 MB in Safari), with localStorage as the fallback where IndexedDB is
 * missing or broken (private browsing, blocked storage). Values are the JSON strings
 * persistence.ts writes.
 */
export type KeyValue = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

export const asyncStorageKv: KeyValue = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
  remove: (key) => AsyncStorage.removeItem(key),
};

const DB = 'kindway';
const STORE = 'kv';

/** A key-value store in IndexedDB (database `kindway`, store `kv`), or null where there's no IndexedDB. */
export function indexedDbKv(): KeyValue | null {
  const idb = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  if (!idb) return null;
  let opened: Promise<IDBDatabase> | null = null;
  const db = () =>
    (opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = idb.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => {
        // The browser can drop the connection (WebKit does after a web app is backgrounded);
        // the next call opens a new one.
        req.result.onclose = () => (opened = null);
        resolve(req.result);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB blocked'));
    })).catch((e) => {
      opened = null;
      throw e;
    });
  const transaction = async (mode: IDBTransactionMode) => {
    try {
      return (await db()).transaction(STORE, mode);
    } catch (e) {
      // A connection that was closed without telling us: open a new one, once.
      if ((e as { name?: string })?.name !== 'InvalidStateError') throw e;
      opened = null;
      return (await db()).transaction(STORE, mode);
    }
  };
  const run = async <T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>) => {
    const tx = await transaction(mode);
    const req = act(tx.objectStore(STORE));
    return new Promise<T>((resolve, reject) => {
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
  };
  return {
    get: async (key) => {
      const value = await run('readonly', (s) => s.get(key));
      return typeof value === 'string' ? value : null;
    },
    set: async (key, value) => {
      await run('readwrite', (s) => s.put(value, key));
    },
    remove: async (key) => {
      await run('readwrite', (s) => s.delete(key));
    },
  };
}

/**
 * Moves one key from `from` to `to` without ever leaving it nowhere: copy, read the copy back and
 * compare, and only then remove the original. Anything unexpected keeps the original.
 */
export async function moveToIndexedDb(key: string, from: KeyValue, to: KeyValue): Promise<'moved' | 'already' | 'none' | 'failed'> {
  let copied = false;
  try {
    if ((await to.get(key)) !== null) return 'already';
    const value = await from.get(key);
    if (value === null) return 'none';
    await to.set(key, value);
    copied = true;
    if ((await to.get(key)) === value) {
      await from.remove(key);
      return 'moved';
    }
  } catch {
    // Fall through.
  }
  // A copy that wasn't confirmed must not count as "already moved" next time, over newer data.
  if (copied) await to.remove(key).catch(() => {});
  return 'failed';
}

/** Set once this browser's journal lives in IndexedDB; then localStorage is no longer a safe fallback. */
export const STORAGE_MARK = 'kindway:storage:v1';

/** Used when IndexedDB fails after the journal moved there: reading or saving fails loudly. */
const unavailableKv: KeyValue = {
  get: async () => {
    throw new Error('storage_unavailable');
  },
  set: async () => {
    throw new Error('storage_unavailable');
  },
  remove: async () => {
    throw new Error('storage_unavailable');
  },
};

/** Gives up on a promise after `ms`: a hung IndexedDB open must not stop the app from loading. */
const within = <T>(promise: Promise<T>, ms: number) =>
  Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

let backend: Promise<KeyValue> | null = null;

/**
 * The store for this run: AsyncStorage off the web; on the web, IndexedDB if a test write works.
 * Without a working IndexedDB, localStorage is used, unless this browser's journal already moved
 * to IndexedDB: then reads and saves fail, so the app says it couldn't load or save rather than
 * starting from an empty journal. On the web it also asks the browser, once, to keep the storage.
 */
export function webBackend(): Promise<KeyValue> {
  return (backend ??= (async () => {
    if (!onWeb()) return asyncStorageKv;
    void (globalThis.navigator as { storage?: { persist?: () => Promise<boolean> } } | undefined)?.storage?.persist?.()?.catch(() => {});
    const idb = indexedDbKv();
    const works = async () => {
      if (!idb) return false;
      await idb.set('kindway:probe', '1');
      if ((await idb.get('kindway:probe')) !== '1') return false;
      await idb.remove('kindway:probe');
      return true;
    };
    if (idb && (await within(works(), 3000).catch(() => false))) {
      await AsyncStorage.setItem(STORAGE_MARK, 'idb').catch(() => {});
      return idb;
    }
    const moved = await AsyncStorage.getItem(STORAGE_MARK).catch(() => null);
    return moved === 'idb' ? unavailableKv : asyncStorageKv;
  })());
}

const perKey = new Map<string, Promise<KeyValue>>();

/** The store for one key: IndexedDB once that key has moved there, otherwise where it already is. */
export function storeFor(key: string): Promise<KeyValue> {
  let store = perKey.get(key);
  if (!store) {
    store = (async () => {
      const kv = await webBackend();
      if (kv === asyncStorageKv || kv === unavailableKv) return kv;
      return (await moveToIndexedDb(key, asyncStorageKv, kv)) === 'failed' ? asyncStorageKv : kv;
    })();
    perKey.set(key, store);
  }
  return store;
}
