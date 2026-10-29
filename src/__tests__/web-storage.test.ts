/**
 * The web journal moves from localStorage to IndexedDB, copying before it deletes anything, so a
 * failed or interrupted move never loses an entry. Native keeps AsyncStorage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { KeyValue } from '@/storage/web-kv';

/** An in-memory store; `failSet` / `readBack` simulate a broken IndexedDB. */
function fakeKv(initial: Record<string, string> = {}, opts: { failSet?: boolean; readBack?: (v: string) => string } = {}) {
  const data = new Map(Object.entries(initial));
  const kv: KeyValue & { data: Map<string, string> } = {
    data,
    async get(key) {
      await Promise.resolve();
      const v = data.get(key) ?? null;
      return v !== null && opts.readBack ? opts.readBack(v) : v;
    },
    async set(key, value) {
      await Promise.resolve();
      if (opts.failSet) throw new Error('QuotaExceededError');
      data.set(key, value);
    },
    async remove(key) {
      await Promise.resolve();
      data.delete(key);
    },
  };
  return kv;
}

const KEY = 'kindway:state:v1';
const JOURNAL = JSON.stringify({ version: 1, entries: [{ id: 'e1', body: 'Fictional entry' }] });

/** The module fresh, with onWeb mocked, so its once-per-run choices start over. */
function load(web: boolean) {
  let mod!: typeof import('@/storage/web-kv');
  let persistence!: typeof import('@/storage/persistence');
  jest.isolateModules(() => {
    jest.doMock('@/services/platform', () => ({ onWeb: () => web }));
    /* eslint-disable @typescript-eslint/no-require-imports */
    mod = require('@/storage/web-kv');
    persistence = require('@/storage/persistence');
    /* eslint-enable @typescript-eslint/no-require-imports */
  });
  return { ...mod, ...persistence };
}

beforeEach(() => AsyncStorage.clear());

describe('moveToIndexedDb', () => {
  const { moveToIndexedDb } = load(true);

  it('copies, checks the copy, then removes the old one', async () => {
    const from = fakeKv({ [KEY]: JOURNAL });
    const to = fakeKv();
    await expect(moveToIndexedDb(KEY, from, to)).resolves.toBe('moved');
    expect(to.data.get(KEY)).toBe(JOURNAL);
    expect(from.data.has(KEY)).toBe(false);
  });

  it('does nothing the second time', async () => {
    const from = fakeKv({ [KEY]: JOURNAL });
    const to = fakeKv();
    await moveToIndexedDb(KEY, from, to);
    await expect(moveToIndexedDb(KEY, from, to)).resolves.toBe('already');
    expect(to.data.get(KEY)).toBe(JOURNAL);
  });

  it('two moves at once (two tabs) still leave the journal in exactly one place, never nowhere', async () => {
    const from = fakeKv({ [KEY]: JOURNAL });
    const to = fakeKv();
    const results = await Promise.all([moveToIndexedDb(KEY, from, to), moveToIndexedDb(KEY, from, to)]);
    expect(results).toContain('moved');
    expect(to.data.get(KEY)).toBe(JOURNAL);
  });

  it('keeps the old copy when IndexedDB refuses the write', async () => {
    const from = fakeKv({ [KEY]: JOURNAL });
    await expect(moveToIndexedDb(KEY, from, fakeKv({}, { failSet: true }))).resolves.toBe('failed');
    expect(from.data.get(KEY)).toBe(JOURNAL);
  });

  it('when the check fails after the copy was written, removes the copy so it can’t later win over newer data', async () => {
    const from = fakeKv({ [KEY]: JOURNAL });
    const to = fakeKv();
    const realGet = to.get.bind(to);
    let reads = 0;
    to.get = async (key) => {
      reads++;
      if (reads === 2) throw new Error('read-back failed');
      return realGet(key);
    };
    await expect(moveToIndexedDb(KEY, from, to)).resolves.toBe('failed');
    expect(to.data.has(KEY)).toBe(false);
    expect(from.data.get(KEY)).toBe(JOURNAL);
  });

  it('keeps the old copy when the copy doesn’t read back the same', async () => {
    const from = fakeKv({ [KEY]: JOURNAL });
    await expect(moveToIndexedDb(KEY, from, fakeKv({}, { readBack: () => '{"version":1,"entries":[]}' }))).resolves.toBe('failed');
    expect(from.data.get(KEY)).toBe(JOURNAL);
  });

  it('has nothing to move for a new journal', async () => {
    await expect(moveToIndexedDb(KEY, fakeKv(), fakeKv())).resolves.toBe('none');
  });
});

describe('jsonStorage', () => {
  it('on the web without IndexedDB (private browsing, blocked storage), keeps using localStorage', async () => {
    const { jsonStorage } = load(true);
    expect(globalThis.indexedDB).toBeUndefined();
    await jsonStorage(KEY).save({ version: 1, entries: [] });
    expect(await AsyncStorage.getItem(KEY)).toBe('{"version":1,"entries":[]}');
    await expect(jsonStorage(KEY).load()).resolves.toEqual({ version: 1, entries: [] });
  });

  it('off the web, never looks at IndexedDB', async () => {
    const touched = jest.fn();
    Object.defineProperty(globalThis, 'indexedDB', { get: touched, configurable: true });
    try {
      const { jsonStorage } = load(false);
      await jsonStorage(KEY).save({ version: 1 });
      await jsonStorage(KEY).load();
      expect(touched).not.toHaveBeenCalled();
      expect(await AsyncStorage.getItem(KEY)).toBe('{"version":1}');
    } finally {
      delete (globalThis as { indexedDB?: unknown }).indexedDB;
    }
  });
});

describe('after the journal has moved to IndexedDB', () => {
  it('a launch where IndexedDB fails reports the failure rather than showing an empty journal that later saves over nothing', async () => {
    // This browser's journal moved earlier; today IndexedDB isn't there (jest has none).
    await AsyncStorage.setItem('kindway:storage:v1', 'idb');
    const { jsonStorage } = load(true);
    await expect(jsonStorage(KEY).load()).rejects.toThrow();
    await expect(jsonStorage(KEY).save({ version: 1, entries: [] })).rejects.toThrow();
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });
});

describe('the IndexedDB adapter', () => {
  /** Just enough of IndexedDB to run the adapter: one store, and a way to drop the connection. */
  function fakeIndexedDb() {
    const data = new Map<string, unknown>();
    const dbs: { closed: boolean; onclose: null | (() => void) }[] = [];
    let opens = 0;
    const request = <T>(run: () => T) => {
      const req: { result?: T; error?: unknown; onsuccess?: () => void; onerror?: () => void } = {};
      queueMicrotask(() => {
        req.result = run();
        req.onsuccess?.();
      });
      return req;
    };
    const factory = {
      open() {
        opens++;
        const db = {
          closed: false,
          onclose: null as null | (() => void),
          objectStoreNames: { contains: () => true },
          createObjectStore() {},
          close() {
            db.closed = true;
          },
          transaction() {
            if (db.closed) throw Object.assign(new Error('The database connection is closing.'), { name: 'InvalidStateError' });
            const tx: { oncomplete?: () => void; onerror?: () => void; onabort?: () => void; error: null; objectStore: () => unknown } = {
              error: null,
              objectStore: () => ({
                get: (k: string) => finish(() => data.get(k)),
                put: (v: unknown, k: string) => finish(() => void data.set(k, v)),
                delete: (k: string) => finish(() => void data.delete(k)),
              }),
            };
            const finish = <T>(run: () => T) => {
              const req = request(run);
              queueMicrotask(() => queueMicrotask(() => tx.oncomplete?.()));
              return req;
            };
            return tx;
          },
        };
        dbs.push(db);
        const req: { result: typeof db; onsuccess?: () => void; onupgradeneeded?: () => void; onerror?: () => void; onblocked?: () => void } = { result: db };
        queueMicrotask(() => req.onsuccess?.());
        return req;
      },
    };
    return {
      factory,
      data,
      opens: () => opens,
      /** The browser drops the connection, as WebKit can after a web app is backgrounded. */
      lose() {
        for (const db of dbs) {
          db.closed = true;
          db.onclose?.();
        }
      },
    };
  }

  afterEach(() => {
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
  });

  it('reopens the database when the browser has dropped the connection', async () => {
    const fake = fakeIndexedDb();
    Object.defineProperty(globalThis, 'indexedDB', { value: fake.factory, configurable: true });
    const { indexedDbKv } = load(true);
    const kv = indexedDbKv()!;
    await kv.set(KEY, JOURNAL);
    fake.lose();
    await expect(kv.get(KEY)).resolves.toBe(JOURNAL);
    await kv.set(KEY, '{"version":1,"entries":[]}');
    expect(fake.data.get(KEY)).toBe('{"version":1,"entries":[]}');
    expect(fake.opens()).toBe(2);
  });
});
