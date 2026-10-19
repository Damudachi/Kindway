import type { ChallengeLevel, ChatMessage, CompassValue, Entry, Reflection, SupportStyle } from '@/data/types';

/**
 * The boundary between the UI and AI. Today only a local mock implements it;
 * TODO(ai): an authenticated Supabase Edge Function client will implement the same interface.
 */
export interface AiService {
  reflect(req: ReflectionRequest): Promise<ReflectionResult>;
  followUp(req: FollowUpRequest): Promise<FollowUpResult>;
}

export type AiError = 'failed' | 'rate' | 'offline';

/** The minimum an analysis needs from an entry. Titles, chats and reflections are never sent. */
export type EntryContext = Pick<Entry, 'id' | 'date' | 'body' | 'feelings' | 'gratitude' | 'compassIds' | 'revisit'>;

export type ReflectionRequest = {
  entry: EntryContext;
  style: SupportStyle;
  challengeGently: boolean;
  challengeLevel: ChallengeLevel;
  /** Only values the user allowed reflections to reference; empty in "this entry only" mode. */
  compass: CompassValue[];
  /** Bounded set of earlier entries the user allows as context; empty in "this entry only" mode. */
  pastEntries: EntryContext[];
  /** Asks for a different perspective than the one already shown. */
  variant?: number;
};

export type ReflectionResult = { ok: true; reflection: Reflection } | { ok: false; error: AiError };

export type FollowUpRequest = {
  entry: EntryContext;
  reflection?: Reflection;
  style: SupportStyle;
  /** The conversation so far, ending with the user's new message. */
  messages: ChatMessage[];
};

export type FollowUpResult = { ok: true; message: ChatMessage } | { ok: false; error: AiError };
