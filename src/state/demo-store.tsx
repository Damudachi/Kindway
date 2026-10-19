import { createContext, use, useReducer, type Dispatch, type ReactNode } from 'react';

import { SAMPLE_CHAT, SAMPLE_COMPASS, SAMPLE_ENTRIES, SAMPLE_MEMORIES, SAMPLE_TOMORROW } from '@/data/sample';
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

/**
 * Local-only, in-memory state for the UX foundation. Nothing here is persisted or synced.
 * TODO(backend): replace with Supabase-backed data once auth, schema and RLS exist.
 */
export type DemoState = {
  onboarded: boolean;
  account: { email: string } | null;
  supportStyle: SupportStyle;
  challengeGently: boolean;
  challengeLevel: ChallengeLevel;
  contextScope: ContextScope;
  weeklyPatterns: boolean;
  aiConsent: AiConsent;
  compass: CompassValue[];
  memories: Memory[];
  entries: Entry[];
  draft: Draft;
  tomorrow: TomorrowStep | null;
  chats: Record<string, ChatMessage[]>;
  insightFeedback: Record<string, InsightFeedback>;
  reminders: Reminders;
  /** Entry whose blaze should play the paint animation once. */
  justPainted?: string;
  demo: { ai: DemoAi; signInError: boolean; sessionExpired: boolean; emptyJournal: boolean };
};

export const emptyDraft: Draft = { text: '', feelings: [], gratitude: '' };

export const initialState: DemoState = {
  onboarded: false,
  account: null,
  supportStyle: 'understand',
  challengeGently: true,
  challengeLevel: 'gentle',
  contextScope: 'relevant',
  weeklyPatterns: true,
  aiConsent: 'unset',
  compass: SAMPLE_COMPASS,
  memories: SAMPLE_MEMORIES,
  entries: SAMPLE_ENTRIES,
  draft: emptyDraft,
  tomorrow: SAMPLE_TOMORROW,
  chats: { e4: SAMPLE_CHAT },
  insightFeedback: {},
  reminders: { enabled: false, permission: 'unasked', time: '9:00 PM', days: [true, true, true, true, true, false, false] },
  demo: { ai: 'ok', signInError: false, sessionExpired: false, emptyJournal: false },
};

export type Action =
  | { type: 'patch'; patch: Partial<DemoState> }
  | { type: 'demo'; patch: Partial<DemoState['demo']> }
  | { type: 'draft'; patch: Partial<Draft> }
  | { type: 'clearDraft' }
  | { type: 'saveEntry'; entry: Entry }
  | { type: 'updateEntry'; id: string; patch: Partial<Entry> }
  | { type: 'setReflection'; id: string; status: Entry['reflectionStatus']; reflection?: Reflection }
  | { type: 'deleteEntry'; id: string }
  | { type: 'compass'; compass: CompassValue[] }
  | { type: 'chat'; entryId: string; messages: ChatMessage[] }
  | { type: 'insight'; id: string; feedback: InsightFeedback | undefined }
  | { type: 'reminders'; patch: Partial<Reminders> }
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
      return { ...state, entries: [action.entry, ...state.entries], draft: emptyDraft, justPainted: action.entry.id };
    case 'updateEntry':
      return { ...state, entries: state.entries.map((e) => (e.id === action.id ? { ...e, ...action.patch } : e)) };
    case 'setReflection':
      return {
        ...state,
        entries: state.entries.map((e) =>
          e.id === action.id ? { ...e, reflectionStatus: action.status, reflection: action.reflection ?? e.reflection } : e,
        ),
      };
    case 'deleteEntry': {
      const chats = { ...state.chats };
      delete chats[action.id];
      return { ...state, entries: state.entries.filter((e) => e.id !== action.id), chats };
    }
    case 'compass':
      return { ...state, compass: action.compass };
    case 'chat':
      return { ...state, chats: { ...state.chats, [action.entryId]: action.messages } };
    case 'insight': {
      const insightFeedback = { ...state.insightFeedback };
      if (action.feedback) insightFeedback[action.id] = action.feedback;
      else delete insightFeedback[action.id];
      return { ...state, insightFeedback };
    }
    case 'reminders':
      return { ...state, reminders: { ...state.reminders, ...action.patch } };
    case 'reset':
      return initialState;
  }
}

const StoreContext = createContext<{ state: DemoState; dispatch: Dispatch<Action> } | null>(null);

export function DemoStoreProvider({ children, initial = initialState }: { children: ReactNode; initial?: DemoState }) {
  const [state, dispatch] = useReducer(reducer, initial);
  return <StoreContext value={{ state, dispatch }}>{children}</StoreContext>;
}

export function useStore() {
  const ctx = use(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside DemoStoreProvider');
  return ctx;
}

/** Entries as the UI should see them, honoring the "empty journal" demo state. */
export function useEntries() {
  const { state } = useStore();
  return state.demo.emptyJournal ? state.entries.filter((e) => !e.sample) : state.entries;
}
