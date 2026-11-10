import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { AiConsentDialog } from '@/components/ai-consent-dialog';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Chip, ChipRow } from '@/components/chip';
import { useSnackbar } from '@/components/feedback';
import { InsightReviewView } from '@/components/insight-review';
import { Notice } from '@/components/notice';
import { SectionTitle } from '@/components/illustrations';
import { Text } from '@/components/text';
import { longDate, shortDate } from '@/data/dates';
import type { Entry } from '@/data/types';
import { requestAiReview, type AiReviewError } from '@/services/ai/remote';
import type { InsightPeriod, InsightReview, SourceRef, SuggestedAction } from '@/services/insights';
import { useSync } from '@/state/cloud-sync';
import { useAiBlocker, useRealAi } from '@/state/real-ai';
import { makeStyles } from '@/theme/theme';
import { space } from '@/theme/tokens';

/**
 * Mirrors the server's default limits so the app can explain them before anything is sent.
 * The server enforces its own configured limits regardless (supabase/functions/_shared/ai-config.ts).
 */
export const AI_REVIEW_LIMITS = { minEntries: 3, maxEntries: 20, maxChars: 12000, latest: { maxEntries: 25, maxChars: 20000 } };

/**
 * "All entries" never sends the whole journal: the newest entries that fit in the count and size
 * limits, newest first, stopping at the first one that wouldn't fit so the set stays unbroken.
 */
export function latestEntries(entries: Entry[], limits: { maxEntries: number; maxChars: number }): Entry[] {
  const out: Entry[] = [];
  let chars = 0;
  for (const e of [...entries].sort((a, b) => b.date.localeCompare(a.date))) {
    const n = e.body.length + (e.gratitude?.length ?? 0);
    if (out.length >= limits.maxEntries || chars + n > limits.maxChars) break;
    out.push(e);
    chars += n;
  }
  return out;
}

const ERROR_COPY: Record<AiReviewError, { title: string; body: string }> = {
  failed: { title: 'The review didn’t come through', body: 'Nothing was saved. You can try again.' },
  rate: { title: 'AI reviews are paused for a little while', body: 'You’ve reached the review limit for now. Try again later.' },
  offline: { title: 'You’re offline', body: 'AI reviews need a connection. Nothing was sent.' },
  timeout: { title: 'The AI took too long to answer', body: 'Nothing was saved. You can try again.' },
  unavailable: { title: 'AI reviews aren’t available right now', body: 'The AI service couldn’t be reached. Try again later.' },
  invalid: { title: 'The AI’s reply couldn’t be used', body: 'It didn’t come back in a form Kindway can check, so nothing is shown.' },
  consent: { title: 'AI reviews aren’t allowed on this account', body: 'Nothing was sent. You can allow reviews across entries in AI processing settings.' },
  'not-synced': { title: 'Some entries haven’t reached your account yet', body: 'AI reads the copies in your account, so it waits for cloud backup. Nothing was sent.' },
  'too-long': { title: 'Too much text for one review', body: 'Nothing was sent. Choose a shorter period.' },
  busy: { title: 'Another AI request is still running', body: 'Kindway handles one AI request at a time. Try again in a moment.' },
  safety: { title: 'Kindway didn’t write a review', body: 'Something in these entries sounded like it might be heavy or unsafe.' },
  'selection-changed': { title: 'The entries changed', body: 'Something was edited, deleted or kept out since this list was shown. Nothing was sent; check the list and try again.' },
  insufficient: { title: 'Not enough entries', body: `A review starts at ${AI_REVIEW_LIMITS.minEntries} entries.` },
  'too-many': { title: 'Too many entries for one review', body: 'Nothing was sent. Choose “This week”, or keep some entries out of analysis.' },
  'too-much-text': { title: 'Too much text for one review', body: 'Nothing was sent. Choose “This week”, or keep some entries out of analysis.' },
};

type Run =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; review: InsightReview; stored: boolean }
  | { status: 'safety' }
  | { status: 'error'; error: AiReviewError };

type Props = {
  period: InsightPeriod;
  /** The period's entries the user hasn't kept out of analysis. */
  entries: Entry[];
  resolve: (ref: SourceRef) => { onPress: () => void } | null;
  onSaveStep: (action: SuggestedAction) => void;
};

/**
 * The optional AI review. Unlike the counts above it, it sends entry text to the provider, so it
 * runs only when asked, lists exactly which entries go, and needs its own permission.
 */
export function AiReviewPanel({ period, entries, resolve, onSaveStep }: Props) {
  const styles = useStyles();
  const real = useRealAi();
  const sync = useSync();
  const snack = useSnackbar();
  const blocker = useAiBlocker('cross_entry_analysis');
  // Whether the consent dialog is open; it asks right here rather than sending people to Settings.
  const [asking, setAsking] = useState(false);
  const [run, setRun] = useState<Run>({ status: 'idle' });
  const aiPeriod = period;
  // A different period, permission or account starts over, so one account's review is never
  // shown to the next, even for a moment.
  const key = `${period}:${real.insights}:${real.account}`;
  /** Whether the account's stored review is known: `failed` means it couldn't be read, so what's shown (or not) may be out of date. */
  const [saved, setSaved] = useState<'checking' | 'loaded' | 'failed'>('checking');
  const [attempt, setAttempt] = useState(0);
  const [shownFor, setShownFor] = useState(key);
  if (shownFor !== key) {
    setShownFor(key);
    setRun({ status: 'idle' });
    setSaved('checking');
  }

  // Show the account's newest stored review for this period, checked again whenever Patterns
  // comes back into view: it may have been written on another device, or deleted (with
  // "Delete AI outputs", or with one of its entries). A request in progress, or its outcome
  // other than a review, is left alone.
  useFocusEffect(
    useCallback(() => {
      if (!real.insights || !real.outputs) return;
      let cancelled = false;
      real.outputs
        .latestReview(aiPeriod)
        .then((review) => {
          if (cancelled) return;
          setSaved('loaded');
          setRun((r) => {
            if (r.status !== 'idle' && r.status !== 'ready') return r;
            if (!review) return { status: 'idle' };
            const same = r.status === 'ready' && r.review.ai?.id === review.ai?.id;
            return same ? r : { status: 'ready', review, stored: true };
          });
        })
        .catch(() => {
          if (!cancelled) setSaved('failed');
        });
      return () => {
        cancelled = true;
      };
      // `attempt` re-runs the read when the user asks to try again.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aiPeriod, real.insights, real.outputs, attempt]),
  );

  const header = (
    <SectionTitle icon="creation-outline">AI review</SectionTitle>
  );
  const consentDialog = (
    <AiConsentDialog
      scope="cross_entry_analysis"
      blocker={asking && blocker && blocker !== 'consent-loading' ? blocker : null}
      onCancel={() => setAsking(false)}
      onAllowed={() => {
        setAsking(false);
        snack({ message: 'AI reviews allowed. Nothing is sent until you ask for one.' });
      }}
      onGrantFailed={() => {
        setAsking(false);
        snack({ message: 'That couldn’t be saved, so AI reviews are still off. Nothing was sent.' });
      }}
    />
  );
  const intro = 'An AI review reads this period’s entries and suggests themes, patterns and strengths, each linked to the entries it came from.';

  if (real.needs) {
    return (
      <Card style={styles.panel}>
        {header}
        <Text variant="bodyMuted">
          {intro}{' '}
          {real.needs === 'account'
            ? 'It’s optional, and it needs an account with cloud backup and your separate permission.'
            : 'It’s optional, and it reads the copies of your entries in your account, so it needs cloud backup on this device.'}
        </Text>
        {real.needs === 'account' ? (
          <Button variant="secondary" label="Sign in" icon="account-outline" onPress={() => router.push('/account?mode=signin')} style={styles.gap} />
        ) : (
          <Button variant="secondary" label="Turn on cloud backup" icon="cloud-outline" onPress={() => router.push('/sync')} style={styles.gap} />
        )}
      </Card>
    );
  }
  if (!real.insights || !real.invoke) {
    return (
      <Card style={styles.panel}>
        {header}
        <Text variant="bodyMuted">
          {intro} It sends their text to GroqCloud only when you ask. It needs its own permission, separate from reflections.
        </Text>
        <Button variant="secondary" label="Turn on AI reviews" icon="creation-outline" onPress={() => setAsking(true)} style={styles.gap} />
        {consentDialog}
      </Card>
    );
  }

  const invoke = real.invoke;
  const all = period === 'all';
  // "All entries" sends the latest ones that fit; a week or a month sends every entry in it, or says it's too much.
  const sendable = all ? latestEntries(entries, AI_REVIEW_LIMITS.latest) : entries;
  const chars = sendable.reduce((n, e) => n + e.body.length + (e.gratitude?.length ?? 0), 0);
  const tooFew = sendable.length < AI_REVIEW_LIMITS.minEntries;
  const tooMany = !all && sendable.length > AI_REVIEW_LIMITS.maxEntries;
  const tooMuch = !all && chars > AI_REVIEW_LIMITS.maxChars;
  const sorted = [...sendable].sort((a, b) => a.date.localeCompare(b.date));

  const send = async () => {
    setRun({ status: 'loading' });
    const synced = sync ? await sync.ensureSynced(sendable.map((e) => ({ id: e.id, body: e.body }))) : false;
    if (!synced) return setRun({ status: 'error', error: sync?.status === 'offline' ? 'offline' : 'not-synced' });
    const result = await requestAiReview(invoke, aiPeriod, sendable.map((e) => e.id));
    if (result.status === 'ready') setRun({ status: 'ready', review: result.review, stored: false });
    else if (result.status === 'safety') setRun({ status: 'safety' });
    else setRun({ status: 'error', error: result.error });
  };

  return (
    <Card style={styles.panel}>
      {header}
      <Text variant="bodyMuted">
        Optional. Sends the text, feeling tags, good things and “come back to this” marks of the entries below to GroqCloud, plus compass links if you allow them. Nothing is sent until you ask.
      </Text>

      {all && (
        <Text variant="small">
          {`“All entries” never sends your whole journal: only your latest entries, up to ${AI_REVIEW_LIMITS.latest.maxEntries} entries and about ${AI_REVIEW_LIMITS.latest.maxChars.toLocaleString('en-US')} characters. ${
            sendable.length < entries.length ? `You have ${entries.length} entries, so this review would use the latest ${sendable.length}.` : 'All of yours fit.'
          }`}
        </Text>
      )}

      <Text variant="label" style={styles.gap}>
        {sendable.length === 1 ? '1 entry' : `${sendable.length} entries`} would be sent
      </Text>
      {sorted.length > 0 && (
        <ChipRow>
          {sorted.map((e) => (
            <Chip key={e.id} kind="assist" icon="notebook-outline" label={shortDate(e.date)} onPress={() => router.push(`/entry/${e.id}`)} />
          ))}
        </ChipRow>
      )}

      {tooFew ? (
        <Text variant="small">An AI review starts at {AI_REVIEW_LIMITS.minEntries} entries. That’s a starting rule, not a target.</Text>
      ) : tooMany || tooMuch ? (
        <Notice tone="warn" title="Too much for one review">
          {tooMany ? `One review takes at most ${AI_REVIEW_LIMITS.maxEntries} entries.` : `One review takes at most ${AI_REVIEW_LIMITS.maxChars.toLocaleString('en-US')} characters of writing.`} Kindway won’t cut entries
          short without telling you, so choose “This week” or keep some entries out of analysis.
        </Notice>
      ) : (
        <Button
          variant="secondary"
          label={`Send ${sendable.length} entries for an AI review`}
          icon="creation-outline"
          loading={run.status === 'loading'}
          disabled={run.status === 'loading'}
          onPress={() => void send()}
          style={styles.gap}
        />
      )}

      {run.status === 'loading' && (
        <Text variant="small" accessibilityLiveRegion="polite">
          Asking AI for a review…
        </Text>
      )}
      {run.status === 'error' && (
        <Notice tone="warn" title={ERROR_COPY[run.error].title}>
          {ERROR_COPY[run.error].body}
        </Notice>
      )}
      {run.status === 'idle' && saved === 'checking' && (
        <Text variant="small" accessibilityLiveRegion="polite">
          Looking for your saved AI review…
        </Text>
      )}
      {run.status === 'idle' && saved === 'loaded' && <Text variant="small">No saved AI review for {aiPeriod === 'week' ? 'this week' : aiPeriod === 'month' ? 'the last 30 days' : 'your latest entries'} yet.</Text>}
      {saved === 'failed' && (
        <View style={styles.block}>
          <Notice tone="warn" title="Your saved AI review couldn’t be loaded">
            {run.status === 'ready' ? 'What’s shown here may be out of date.' : 'There may be one in your account.'} Nothing was sent. Try again when you’re connected.
          </Notice>
          <Button
            variant="secondary"
            label="Try loading it again"
            onPress={() => {
              setSaved('checking');
              setAttempt((n) => n + 1);
            }}
          />
        </View>
      )}
      {run.status === 'safety' && (
        <View style={styles.block}>
          <Notice tone="warn" title={ERROR_COPY.safety.title}>
            {ERROR_COPY.safety.body} Reaching a real person matters more than a review right now.
          </Notice>
          <Button variant="secondary" label="See support options" onPress={() => router.push('/support')} />
        </View>
      )}
      {run.status === 'ready' && <AiReview review={run.review} stored={run.stored} resolve={resolve} onSaveStep={onSaveStep} />}
    </Card>
  );
}

function AiReview({ review, stored, resolve, onSaveStep }: { review: InsightReview; stored: boolean } & Pick<Props, 'resolve' | 'onSaveStep'>) {
  const styles = useStyles();
  return (
    <View style={styles.block}>
      <Notice title={stored && review.ai ? `Your last AI review, ${longDate(review.ai.createdAt)}` : 'Written by AI'}>
        Written by {review.ai?.model ?? 'an AI model'} on GroqCloud from the {review.entryCount} entries it was sent. Not written by you or a person, and it can be wrong. Each point links to the
        entries it came from; tell it whether it fits.
      </Notice>
      {review.summary && <Text variant="entry">{review.summary}</Text>}
      {!review.enoughEvidence && (
        <Text variant="body" style={styles.thin}>
          Not enough to go on for patterns yet. That’s a fair answer, not a shortcoming.
        </Text>
      )}
      <InsightReviewView review={review} resolve={resolve} onSaveStep={onSaveStep} />
    </View>
  );
}

const useStyles = makeStyles((color) => ({
  panel: { gap: space.xs, marginTop: space.xl, paddingVertical: space.md },
  block: { gap: space.md, marginTop: space.sm },
  gap: { marginTop: space.xs },
  thin: { color: color.inkMuted },
}));
