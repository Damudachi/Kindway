import type { ChallengeLevel, ChatMessage, CompassValue, Entry, Reflection, ReflectionStatus, SupportStyle } from '@/data/types';

/**
 * The boundary between the UI and AI. Two implementations: the local simulated mock, and the
 * real service behind the generate-reflection Edge Function (remote.ts). Screens don't know which.
 */
export interface AiService {
  reflect(req: ReflectionRequest): Promise<ReflectionResult>;
  followUp(req: FollowUpRequest): Promise<FollowUpResult>;
}

export type AiError = Exclude<ReflectionStatus, 'none' | 'loading' | 'ready'>;

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

/** `conversation-changed`: earlier messages named as context are gone from the account (cleared or deleted elsewhere). */
export type FollowUpError = AiError | 'conversation-changed';
export type FollowUpResult = { ok: true; message: ChatMessage } | { ok: false; error: FollowUpError };
