import { router } from 'expo-router';
import { useCallback } from 'react';

import { nowIso } from '@/data/dates';
import { looksHighRisk } from '@/data/safety';
import { hasAutoTitle, titleFrom } from '@/data/titles';
import type { ChatMessage, Entry, SupportStyle } from '@/data/types';
import { getAiService, type FollowUpError, type FollowUpResult, type ReflectionResult } from '@/services/ai';
import { requestAiFollowUp, requestAiReflection } from '@/services/ai/remote';
import { reflectionRequest, toContext } from '@/state/ai-context';
import { useSync } from '@/state/cloud-sync';
import { useEntries, useStore } from '@/state/demo-store';
import { useRealAi } from '@/state/real-ai';

/** Whether "Save & reflect" and "Reflect on this entry" are offered, and which kind. */
export function useReflectionMode(): 'ai' | 'simulated' | 'off' {
  const { state } = useStore();
  const real = useRealAi();
  return real.reflections ? 'ai' : state.aiConsent === 'ai' ? 'simulated' : 'off';
}

/**
 * Requests a reflection. With real AI allowed (account, cloud backup, consent), it waits until
 * the entry's exact text is in the account, then asks the generate-reflection function, which
 * reads the entry there. Otherwise, or when the user explicitly picks the simulated preview,
 * it uses the on-device mock, whose outcome follows the "Preview states" demo setting.
 * A real-AI failure is shown as a failure; it never quietly turns into a simulated reply.
 * Fire-and-forget: the result lands in the store, so press handlers never hold a pending promise.
 */
export function useRequestReflection() {
  const { state, dispatch } = useStore();
  const entries = useEntries();
  const real = useRealAi();
  const sync = useSync();
  return useCallback(
    (entry: Entry, style: SupportStyle = state.supportStyle, variant = 0, opts: { simulated?: boolean } = {}) => {
      dispatch({ type: 'setReflection', id: entry.id, status: 'loading' });
      const land = (result: ReflectionResult) => {
        if (result.ok) dispatch({ type: 'setReflection', id: entry.id, status: 'ready', reflection: result.reflection });
        else dispatch({ type: 'setReflection', id: entry.id, status: result.error });
        if (!result.ok && result.error === 'safety') router.push('/support');
      };

      if (real.reflections && real.invoke && !opts.simulated) {
        const invoke = real.invoke;
        void (async () => {
          const synced = sync ? await sync.ensureSynced([{ id: entry.id, body: entry.body }]) : false;
          if (!synced) return land({ ok: false, error: sync?.status === 'offline' ? 'offline' : 'not-synced' });
          land(await requestAiReflection(invoke, entry, style));
        })();
        return;
      }
      void getAiService(state.demo.ai).reflect(reflectionRequest(state, entry, style, entries, variant)).then(land);
    },
    [state, dispatch, entries, real, sync],
  );
}

/**
 * Another perspective: the next pre-written one for a simulated reflection, or a new request to
 * the AI for a real one (which counts towards the limits like any other request).
 */
export function useAnotherPerspective() {
  const request = useRequestReflection();
  return useCallback(
    (entry: Entry) => {
      const r = entry.reflection;
      if (!r) return;
      if (r.source === 'ai') request(entry, r.style);
      else request(entry, r.style, (r.variant ?? 0) + 1, { simulated: true });
    },
    [request],
  );
}

/** Whether the follow-up conversation gets real AI replies or simulated ones. */
export function useFollowUpMode(): 'ai' | 'simulated' {
  return useRealAi().followUps ? 'ai' : 'simulated';
}

/**
 * Sends a follow-up message about one entry and appends the reply to that entry's conversation.
 * With follow-up consent (and an account with cloud backup), the reply comes from the
 * generate-follow-up function, after the entry's exact text is in the account; it is sent the
 * AI reflection shown (if any) and the last few AI replies of this conversation as context.
 * Otherwise the reply is simulated. A real-AI failure is reported as one; it never turns into a
 * simulated reply. The reply lands only while the message it answers is still there.
 * `consentJustGiven` uses real AI right after follow-up consent was recorded, before the app has
 * re-read it; the server checks consent again either way.
 */
export function useSendFollowUp() {
  const { state, dispatch } = useStore();
  const real = useRealAi();
  const sync = useSync();
  return useCallback(
    (entry: Entry, text: string, style: SupportStyle, onDone: (error?: FollowUpError) => void, consentJustGiven = false) => {
      const earlier = state.chats[entry.id] ?? [];
      const ai = (real.followUps || consentJustGiven) && real.invoke ? real.invoke : null;
      const mine: ChatMessage = { id: `u${Date.now()}`, from: 'me', text, source: ai ? 'ai' : 'simulated' };
      dispatch({ type: 'appendChat', entryId: entry.id, messages: [mine] });
      const land = (result: FollowUpResult) => {
        if (result.ok) dispatch({ type: 'appendChat', entryId: entry.id, messages: [result.message], after: mine.id });
        onDone(result.ok ? undefined : result.error);
      };

      // Possible high-risk wording gets the reviewed support route, never a reply of either kind.
      if (looksHighRisk(text)) return land({ ok: false, error: 'safety' });
      if (ai) {
        void (async () => {
          const synced = sync ? await sync.ensureSynced([{ id: entry.id, body: entry.body }]) : false;
          if (!synced) return land({ ok: false, error: sync?.status === 'offline' ? 'offline' : 'not-synced' });
          const contextIds = earlier.flatMap((m) => (m.source === 'ai' && m.ai ? [m.ai.id] : []));
          const reflectionId = entry.reflection?.source === 'ai' && entry.reflection.ai ? entry.reflection.ai.id : null;
          land(await requestAiFollowUp(ai, { entryId: entry.id, message: text, style, contextIds, reflectionId }));
        })();
        return;
      }
      void getAiService(state.demo.ai)
        .followUp({ entry: toContext(entry), reflection: entry.reflection, style, messages: [...earlier, mine] })
        .then(land);
    },
    [state.chats, state.demo.ai, dispatch, real, sync],
  );
}

/**
 * Saves the current draft. Returns the entry id, or null when nothing was saved
 * (blank text) or the text routed to Extra support. The entry is always saved before any
 * reflection is requested, so a failed reflection never loses writing.
 */
export function useSaveDraft() {
  const { state, dispatch } = useStore();
  const requestReflection = useRequestReflection();
  const mode = useReflectionMode();
  return useCallback(
    (opts: { reflect: boolean }) => {
      const { draft } = state;
      const body = draft.text.trim();
      if (!body) return null;
      const editing = draft.editingId ? state.entries.find((e) => e.id === draft.editingId) : undefined;
      // A renamed or AI-written title survives an edit; one the device made follows the new text.
      const title = editing && !hasAutoTitle(editing) ? editing.title : titleFrom(body);
      const fields = { body, title, feelings: draft.feelings, gratitude: draft.gratitude.trim() || undefined, compassIds: draft.compassIds };
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
      if (opts.reflect && mode !== 'off') requestReflection(entry, draft.style);
      return entry.id;
    },
    [state, dispatch, requestReflection, mode],
  );
}
