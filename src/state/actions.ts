import { router } from 'expo-router';
import { useCallback } from 'react';

import { nowIso } from '@/data/dates';
import { looksHighRisk } from '@/data/safety';
import type { ChatMessage, Entry, SupportStyle } from '@/data/types';
import { getAiService } from '@/services/ai';
import { reflectionRequest, toContext } from '@/state/ai-context';
import { useEntries, useStore } from '@/state/demo-store';

/**
 * Requests a simulated reflection; the outcome follows the "Preview states" demo setting.
 * Fire-and-forget: the result lands in the store, so press handlers never hold a pending promise.
 */
export function useRequestReflection() {
  const { state, dispatch } = useStore();
  const entries = useEntries();
  return useCallback(
    (entry: Entry, style: SupportStyle = state.supportStyle, variant = 0) => {
      dispatch({ type: 'setReflection', id: entry.id, status: 'loading' });
      void getAiService(state.demo.ai)
        .reflect(reflectionRequest(state, entry, style, entries, variant))
        .then((result) => {
          if (result.ok) dispatch({ type: 'setReflection', id: entry.id, status: 'ready', reflection: result.reflection });
          else dispatch({ type: 'setReflection', id: entry.id, status: result.error });
        });
    },
    [state, dispatch, entries],
  );
}

/** Asks for the next pre-written perspective, keeping the same support style. */
export function useAnotherPerspective() {
  const request = useRequestReflection();
  return useCallback(
    (entry: Entry) => {
      const r = entry.reflection;
      if (r) request(entry, r.style, (r.variant ?? 0) + 1);
    },
    [request],
  );
}

/** Sends a follow-up message about one entry and appends the simulated reply to that entry's conversation. */
export function useSendFollowUp() {
  const { state, dispatch } = useStore();
  return useCallback(
    (entry: Entry, text: string, style: SupportStyle, onDone: (error?: string) => void) => {
      const mine: ChatMessage = { id: `u${Date.now()}`, from: 'me', text };
      const messages = [...(state.chats[entry.id] ?? []), mine];
      dispatch({ type: 'chat', entryId: entry.id, messages });
      void getAiService(state.demo.ai)
        .followUp({ entry: toContext(entry), reflection: entry.reflection, style, messages })
        .then((result) => {
          if (result.ok) dispatch({ type: 'chat', entryId: entry.id, messages: [...messages, result.message] });
          onDone(result.ok ? undefined : result.error);
        });
    },
    [state.chats, state.demo.ai, dispatch],
  );
}

export function titleFrom(text: string) {
  const first = text.trim().split(/[.!?\n]/)[0] ?? '';
  const words = first.split(/\s+/).filter(Boolean).slice(0, 6).join(' ');
  return words.length > 0 ? words : 'Untitled entry';
}

/**
 * Saves the current draft. Returns the entry id, or null when nothing was saved
 * (blank text) or the text routed to Extra support. The entry is always saved before any
 * reflection is requested, so a failed reflection never loses writing.
 */
export function useSaveDraft() {
  const { state, dispatch } = useStore();
  const requestReflection = useRequestReflection();
  return useCallback(
    (opts: { reflect: boolean }) => {
      const { draft } = state;
      const body = draft.text.trim();
      if (!body) return null;
      const fields = { body, title: titleFrom(body), feelings: draft.feelings, gratitude: draft.gratitude.trim() || undefined, compassIds: draft.compassIds };
      if (draft.editingId) {
        dispatch({ type: 'updateEntry', id: draft.editingId, patch: fields });
        dispatch({ type: 'clearDraft' });
        return draft.editingId;
      }
      const entry: Entry = { id: `n${Date.now()}`, date: nowIso(), ...fields, reflectionStatus: 'none', sample: false };
      dispatch({ type: 'saveEntry', entry });
      if (opts.reflect && looksHighRisk(entry.body)) {
        router.push('/support');
        return null;
      }
      if (opts.reflect && state.aiConsent === 'ai') requestReflection(entry, draft.style);
      return entry.id;
    },
    [state, dispatch, requestReflection],
  );
}
