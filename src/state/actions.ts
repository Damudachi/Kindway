import { router } from 'expo-router';
import { useCallback } from 'react';

import { nowIso } from '@/data/dates';
import { demoReflection, looksHighRisk } from '@/data/demo-reflection';
import type { Entry } from '@/data/types';
import { useStore } from '@/state/demo-store';

const SIMULATED_LATENCY = 1400;

/** Simulates requesting an AI reflection; the outcome follows the "Preview states" demo setting. */
export function useRequestReflection() {
  const { state, dispatch } = useStore();
  return useCallback(
    (entry: Pick<Entry, 'id' | 'body'>, style = state.supportStyle) => {
      dispatch({ type: 'setReflection', id: entry.id, status: 'loading' });
      setTimeout(() => {
        const outcome = state.demo.ai;
        if (outcome === 'ok') {
          dispatch({
            type: 'setReflection',
            id: entry.id,
            status: 'ready',
            reflection: demoReflection(entry.body, style, state.contextScope === 'current' ? [] : state.compass),
          });
        } else {
          dispatch({ type: 'setReflection', id: entry.id, status: outcome === 'fail' ? 'failed' : outcome });
        }
      }, SIMULATED_LATENCY);
    },
    [dispatch, state.demo.ai, state.supportStyle, state.contextScope, state.compass],
  );
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
