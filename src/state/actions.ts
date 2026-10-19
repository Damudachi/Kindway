import { router } from 'expo-router';
import { useCallback } from 'react';

import { nowIso } from '@/data/dates';
import { looksHighRisk } from '@/data/safety';
import type { Entry } from '@/data/types';
import { getAiService } from '@/services/ai';
import { reflectionRequest, weeklyEntries, weeklyRequest } from '@/state/ai-context';
import { useEntries, useStore } from '@/state/demo-store';

/** Requests a (simulated) reflection; the outcome follows the "Preview states" demo setting. */
export function useRequestReflection() {
  const { state, dispatch } = useStore();
  const entries = useEntries();
  return useCallback(
    // Fire-and-forget: the result lands in the store, so press handlers never hold a pending promise.
    (entry: Entry, style = state.supportStyle) => {
      dispatch({ type: 'setReflection', id: entry.id, status: 'loading' });
      void getAiService(state.demo.ai)
        .reflect(reflectionRequest(state, entry, style, entries))
        .then((result) => {
          if (result.ok) dispatch({ type: 'setReflection', id: entry.id, status: 'ready', reflection: result.reflection });
          else dispatch({ type: 'setReflection', id: entry.id, status: result.error });
        });
    },
    [state, dispatch, entries],
  );
}

/** Generates the weekly review on demand. Nothing is analysed until the user asks. */
export function useRequestWeeklyReview() {
  const { state, dispatch } = useStore();
  const entries = useEntries();
  return useCallback(() => {
    const entryIds = weeklyEntries(entries).map((e) => e.id);
    dispatch({ type: 'weekly', weekly: { status: 'loading' } });
    void getAiService(state.demo.ai)
      .weeklyReview(weeklyRequest(state, entries))
      .then((result) => dispatch({ type: 'weekly', weekly: result.status === 'ready' ? { ...result, entryIds } : result }));
  }, [state, dispatch, entries]);
}

function titleFrom(text: string) {
  const first = text.trim().split(/[.!?\n]/)[0] ?? '';
  const words = first.split(/\s+/).slice(0, 6).join(' ');
  return words.length > 0 ? words : 'Untitled entry';
}

/**
 * Saves the current draft. Returns the new entry id, or null when the text routed to Extra support.
 * The entry is always saved first, so a failed AI request never loses writing.
 */
export function useSaveDraft() {
  const { state, dispatch } = useStore();
  const requestReflection = useRequestReflection();
  return useCallback(
    (opts: { reflect: boolean }) => {
      const { draft } = state;
      if (draft.editingId) {
        dispatch({
          type: 'updateEntry',
          id: draft.editingId,
          patch: { body: draft.text, feelings: draft.feelings, gratitude: draft.gratitude || undefined },
        });
        dispatch({ type: 'clearDraft' });
        return draft.editingId;
      }
      const entry: Entry = {
        id: `n${Date.now()}`,
        date: nowIso(),
        title: titleFrom(draft.text),
        body: draft.text.trim(),
        feelings: draft.feelings,
        gratitude: draft.gratitude.trim() || undefined,
        reflectionStatus: 'none',
        sample: false,
      };
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
