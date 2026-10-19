import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Where the prototype keeps its state between launches. Only this device's app storage is used;
 * nothing is synced, backed up or encrypted by Kindway.
 * TODO(backend): replace with a Supabase-backed repository once auth, schema and RLS exist.
 */
export interface StateStorage {
  load(): Promise<unknown>;
  save(snapshot: unknown): Promise<void>;
  clear(): Promise<void>;
}

const KEY = 'kindway:state:v1';

export const deviceStorage: StateStorage = {
  async load() {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  },
  save: (snapshot) => AsyncStorage.setItem(KEY, JSON.stringify(snapshot)),
  clear: () => AsyncStorage.removeItem(KEY),
};

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
