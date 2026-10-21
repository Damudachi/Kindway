import { createContext, use, useEffect, useMemo, useReducer, useRef, useState, type Dispatch, type ReactNode } from 'react';
import { AppState } from 'react-native';

import type {
  AiConsent,
  ChallengeLevel,
  ChatMessage,
  CompassValue,
  ContextScope,
  DemoAi,
  Draft,
  Entry,
  InsightFeedback,
  Memory,
  Reflection,
  Reminders,
  SupportStyle,
  TomorrowStep,
} from '@/data/types';
import { applyCloud, mergeSnapshots, toCloud, type CloudSnapshot } from '@/services/cloud/records';
import { deviceStorage, type StateStorage } from '@/storage/persistence';

/**
 * App state, saved to this device's app storage between launches. Which journal it holds
 * (local-only, or one account's synced cache) is chosen by the session; see state/session.tsx.
 * Real entries start empty; fictional sample data lives only in the sample-insights demo.
 */
export type DemoState = {
  onboarded: boolean;
  supportStyle: SupportStyle;
  challengeGently: boolean;
  challengeLevel: ChallengeLevel;
  contextScope: ContextScope;
  weeklyPatterns: boolean;
  /** Whether insight reviews may count compass links the user added. */
  insightsUseCompass: boolean;
  aiConsent: AiConsent;
  compass: CompassValue[];
  memories: Memory[];
  entries: Entry[];
  draft: Draft;
  tomorrow: TomorrowStep | null;
  chats: Record<string, ChatMessage[]>;
  /** Feedback on insights, by insight id. Sample-demo ids start with `sample:`. */
  insightFeedback: Record<string, InsightFeedback>;
  reminders: Reminders;
  /** Entry whose blaze should play the paint animation once. Not saved. */
  justPainted?: string;
  /** Reviewer switches for simulated conditions. Not saved. */
  demo: { ai: DemoAi; sessionExpired: boolean };
};

export const emptyDraft: Draft = { text: '', feelings: [], gratitude: '', compassIds: [] };

export const initialState: DemoState = {
  onboarded: false,
  supportStyle: 'understand',
  challengeGently: true,
  challengeLevel: 'gentle',
  contextScope: 'relevant',
  weeklyPatterns: true,
  insightsUseCompass: true,
  aiConsent: 'unset',
  compass: [],
  memories: [],
  entries: [],
  draft: emptyDraft,
  tomorrow: null,
  chats: {},
  insightFeedback: {},
  reminders: { enabled: false, permission: 'unasked', time: '9:00 PM', days: [true, true, true, true, true, false, false], weekly: false, weeklyDay: 6 },
  demo: { ai: 'ok', sessionExpired: false },
};

export type Action =
  | { type: 'patch'; patch: Partial<DemoState> }
  | { type: 'demo'; patch: Partial<DemoState['demo']> }
  | { type: 'draft'; patch: Partial<Draft> }
  | { type: 'clearDraft' }
  | { type: 'saveEntry'; entry: Entry }
  | { type: 'updateEntry'; id: string; patch: Partial<Entry> }
  | { type: 'setReflection'; id: string; status: Entry['reflectionStatus']; reflection?: Reflection }
  | { type: 'removeReflection'; id: string }
  | { type: 'deleteEntry'; id: string }
  | { type: 'compass'; compass: CompassValue[] }
  | { type: 'chat'; entryId: string; messages: ChatMessage[] }
  /**
   * Adds messages to an entry's conversation. With `after`, only while that message is still
   * there: a reply that arrives after the conversation was cleared, or the entry deleted, is dropped.
   */
  | { type: 'appendChat'; entryId: string; messages: ChatMessage[]; after?: string }
  /** Removes every message sent to or written by the real AI, in every conversation. */
  | { type: 'removeAiChats' }
  | { type: 'insight'; id: string; feedback: InsightFeedback | undefined }
  | { type: 'tomorrow'; step: TomorrowStep | null }
  | { type: 'reminders'; patch: Partial<Reminders> }
  /** Brings in the account's cloud copy, keeping anything changed here since `base`. */
  | { type: 'applyCloud'; base: CloudSnapshot; remote: CloudSnapshot }
  /**
   * Brings in the account's newest AI reflection per entry. `known` are the AI reflection ids
   * this device had when the read started; one that arrived since is newer than the read.
   */
  | { type: 'applyAiReflections'; reflections: Record<string, Reflection>; known: string[] }
  | { type: 'reset' };

export function reducer(state: DemoState, action: Action): DemoState {
  switch (action.type) {
    case 'patch':
      return { ...state, ...action.patch };
    case 'demo':
      return { ...state, demo: { ...state.demo, ...action.patch } };
    case 'draft':
      return { ...state, draft: { ...state.draft, ...action.patch } };
    case 'clearDraft':
      return { ...state, draft: emptyDraft };
    case 'saveEntry':
      // Never store a blank entry, or a fictional one.
      if (!action.entry.body.trim() || action.entry.sample) return state;
      return { ...state, entries: [action.entry, ...state.entries], draft: emptyDraft, justPainted: action.entry.id };
    case 'updateEntry':
      if (action.patch.body !== undefined && !action.patch.body.trim()) return state;
      return { ...state, entries: state.entries.map((e) => (e.id === action.id ? { ...e, ...action.patch } : e)) };
    case 'setReflection':
      return {
        ...state,
        entries: state.entries.map((e) =>
          e.id === action.id ? { ...e, reflectionStatus: action.status, reflection: action.reflection ?? e.reflection } : e,
        ),
      };
    case 'removeReflection':
      return { ...state, entries: state.entries.map((e) => (e.id === action.id ? { ...e, reflection: undefined, reflectionStatus: 'none' } : e)) };
    case 'deleteEntry': {
      const { id } = action;
      const chats = { ...state.chats };
      delete chats[id];
      const insightFeedback = { ...state.insightFeedback };
      delete insightFeedback[`revisit:${id}`];
      return {
        ...state,
        chats,
        insightFeedback,
        // Other reflections stop pointing at it, and the Tomorrow step loses its link but stays.
        entries: state.entries
          .filter((e) => e.id !== id)
          .map((e) => (e.reflection?.related?.includes(id) ? { ...e, reflection: { ...e.reflection, related: e.reflection.related.filter((r) => r !== id) } } : e)),
        tomorrow:
          state.tomorrow?.source?.kind === 'reflection' && state.tomorrow.source.entryId === id ? { ...state.tomorrow, source: undefined } : state.tomorrow,
        draft: state.draft.editingId === id ? emptyDraft : state.draft,
      };
    }
    case 'compass': {
      // Entries keep only links to values that still exist.
      const ids = new Set(action.compass.map((c) => c.id));
      return {
        ...state,
        compass: action.compass,
        entries: state.entries.map((e) => (e.compassIds?.some((c) => !ids.has(c)) ? { ...e, compassIds: e.compassIds.filter((c) => ids.has(c)) } : e)),
      };
    }
    case 'chat':
      return { ...state, chats: { ...state.chats, [action.entryId]: action.messages } };
    case 'appendChat': {
      const current = state.chats[action.entryId] ?? [];
      if (action.after && !current.some((m) => m.id === action.after)) return state;
      if (!action.after && !state.entries.some((e) => e.id === action.entryId)) return state;
      return { ...state, chats: { ...state.chats, [action.entryId]: [...current, ...action.messages] } };
    }
    case 'removeAiChats':
      return { ...state, chats: Object.fromEntries(Object.entries(state.chats).map(([id, messages]) => [id, messages.filter((m) => m.source !== 'ai')])) };
    case 'insight': {
      const insightFeedback = { ...state.insightFeedback };
      if (action.feedback) insightFeedback[action.id] = action.feedback;
      else delete insightFeedback[action.id];
      return { ...state, insightFeedback };
    }
    case 'tomorrow':
      return { ...state, tomorrow: action.step };
    case 'reminders':
      return { ...state, reminders: { ...state.reminders, ...action.patch } };
    case 'applyCloud':
      return applyCloud(state, mergeSnapshots(action.base, toCloud(state), action.remote));
    case 'applyAiReflections': {
      const known = new Set(action.known);
      return {
        ...state,
        entries: state.entries.map((e) => {
          const local = e.reflection;
          const remote = action.reflections[e.id];
          // A request in flight lands on its own; simulated reflections are device-only.
          if (e.reflectionStatus === 'loading' || (local && local.source !== 'ai')) return e;
          // Arrived after the read started, or the same record: keep it, with this device's feedback.
          if (local?.ai && (!known.has(local.ai.id) || local.ai.id === remote?.ai?.id)) return e;
          if (remote) return { ...e, reflection: remote, reflectionStatus: 'ready' };
          // Deleted from the account (on another device, or with "Delete AI outputs").
          return local ? { ...e, reflection: undefined, reflectionStatus: 'none' } : e;
        }),
      };
    }
    case 'reset':
      return initialState;
  }
}

const VERSION = 1;

/** What is written to device storage: everything except reviewer switches and one-shot animation flags. */
export function toSnapshot(state: DemoState) {
  const { demo: _demo, justPainted: _painted, ...saved } = state;
  return { version: VERSION, state: saved };
}

/** Rebuilds state from storage. Anything unreadable starts fresh rather than half-loading. */
export function fromSnapshot(raw: unknown): DemoState {
  if (!raw || typeof raw !== 'object' || (raw as { version?: number }).version !== VERSION) return initialState;
  const stored = (raw as { state?: Partial<DemoState> & { account?: unknown } }).state;
  if (!stored || typeof stored !== 'object') return initialState;
  // `account` was the Phase 2 placeholder; the real session now lives outside the journal.
  const { account: _account, ...saved } = stored;
  return {
    ...initialState,
    ...saved,
    demo: initialState.demo,
    draft: { ...emptyDraft, ...saved.draft },
    reminders: { ...initialState.reminders, ...saved.reminders },
    entries: (saved.entries ?? [])
      .filter((e) => !e.sample)
      // A reflection that was still "loading" when the app closed never arrived.
      .map((e) => (e.reflectionStatus === 'loading' ? { ...e, reflectionStatus: e.reflection ? 'ready' : 'failed' } : e)),
  };
}

const StoreContext = createContext<{ state: DemoState; dispatch: Dispatch<Action> } | null>(null);

type ProviderProps = {
  children: ReactNode;
  /** Skip loading and start from this state (tests, previews). It is still saved. */
  initial?: DemoState;
  storage?: StateStorage;
};

export function DemoStoreProvider({ children, initial, storage = deviceStorage }: ProviderProps) {
  const [state, dispatch] = useReducer(reducer, initial ?? initialState);
  const [hydrated, setHydrated] = useState(!!initial);
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    storage
      .load()
      .catch(() => null)
      .then((raw) => {
        if (cancelled) return;
        dispatch({ type: 'patch', patch: fromSnapshot(raw) });
        setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
    // Load once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save shortly after changes, and right away when the app goes to the background.
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => void storage.save(toSnapshot(state)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [state, hydrated, storage]);
  useEffect(() => {
    if (!hydrated) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') void storage.save(toSnapshot(latest.current)).catch(() => {});
    });
    return () => {
      sub.remove();
      // Switching journals (sign-in, sign-out) unmounts this provider; keep the last changes.
      void storage.save(toSnapshot(latest.current)).catch(() => {});
    };
  }, [hydrated, storage]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  if (!hydrated) return null;
  return <StoreContext value={value}>{children}</StoreContext>;
}

export function useStore() {
  const ctx = use(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside DemoStoreProvider');
  return ctx;
}

/** The user's entries, newest first. */
export function useEntries() {
  const { state } = useStore();
  return useMemo(() => [...state.entries].sort((a, b) => b.date.localeCompare(a.date)), [state.entries]);
}
