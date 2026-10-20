import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { InsightReviewView } from '@/components/insight-review';
import { Notice } from '@/components/notice';
import { Text } from '@/components/text';
import { longDate, shortDate } from '@/data/dates';
import type { Entry } from '@/data/types';
import { requestAiReview, type AiReviewError } from '@/services/ai/remote';
import type { InsightPeriod, InsightReview, SourceRef, SuggestedAction } from '@/services/insights';
import { useSync } from '@/state/cloud-sync';
import { useRealAi } from '@/state/real-ai';
import { color, space } from '@/theme/tokens';

/**
 * Mirrors the server's default limits so the app can explain them before anything is sent.
 * The server enforces its own configured limits regardless (supabase/functions/_shared/ai-config.ts).
 */
export const AI_REVIEW_LIMITS = { minEntries: 3, maxEntries: 20, maxChars: 12000 };

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
  const real = useRealAi();
  const sync = useSync();
  const [run, setRun] = useState<Run>({ status: 'idle' });
  const aiPeriod = period === 'all' ? null : period;
  const key = `${period}:${real.insights}`;
  const [shownFor, setShownFor] = useState(key);
  if (shownFor !== key) {
    setShownFor(key);
    setRun({ status: 'idle' });
  }

  // Show the newest stored review for this period, if there is one.
  useEffect(() => {
    if (!aiPeriod || !real.insights || !real.outputs) return;
    let cancelled = false;
    real.outputs
      .latestReview(aiPeriod)
      .then((review) => {
        if (!cancelled && review) setRun((r) => (r.status === 'idle' ? { status: 'ready', review, stored: true } : r));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [aiPeriod, real.insights, real.outputs]);

  const header = (
    <Text variant="title" accessibilityRole="header">
      AI review
    </Text>
  );

  if (!aiPeriod) {
    return (
      <View style={styles.panel}>
        {header}
        <Text variant="bodyMuted">AI reviews cover “This week” or “Last 30 days”, so they never send your whole journal.</Text>
      </View>
    );
  }
  if (real.needs) {
    return (
      <View style={styles.panel}>
        {header}
        <Text variant="bodyMuted">
          {real.needs === 'account'
            ? 'An optional AI review reads your entries’ text. It needs an account with cloud backup and your separate permission.'
            : 'An optional AI review reads the copies of your entries in your account, so it needs cloud backup on this device.'}
        </Text>
        {real.needs === 'cloud-sync' && <Button variant="text" label="About cloud backup" onPress={() => router.push('/sync')} />}
      </View>
    );
  }
  if (!real.insights || !real.invoke) {
    return (
      <View style={styles.panel}>
        {header}
        <Text variant="bodyMuted">An optional AI review sends the text of the entries listed here to GroqCloud. It needs its own permission, separate from reflections.</Text>
        <Button variant="text" label="AI processing settings" onPress={() => router.push('/settings/ai-consent')} />
      </View>
    );
  }

  const invoke = real.invoke;
  const chars = entries.reduce((n, e) => n + e.body.length + (e.gratitude?.length ?? 0), 0);
  const tooFew = entries.length < AI_REVIEW_LIMITS.minEntries;
  const tooMany = entries.length > AI_REVIEW_LIMITS.maxEntries;
  const tooMuch = chars > AI_REVIEW_LIMITS.maxChars;
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  const send = async () => {
    setRun({ status: 'loading' });
    const synced = sync ? await sync.ensureSynced(entries.map((e) => ({ id: e.id, body: e.body }))) : false;
    if (!synced) return setRun({ status: 'error', error: sync?.status === 'offline' ? 'offline' : 'not-synced' });
    const result = await requestAiReview(invoke, aiPeriod, entries.map((e) => e.id));
    if (result.status === 'ready') setRun({ status: 'ready', review: result.review, stored: false });
    else if (result.status === 'safety') setRun({ status: 'safety' });
    else setRun({ status: 'error', error: result.error });
  };

  return (
    <View style={styles.panel}>
      {header}
      <Text variant="bodyMuted">
        Optional. Sends the text, feeling tags, good things and “come back to this” marks of the entries below to GroqCloud, plus compass links if you allow them. Nothing is sent until you ask.
      </Text>

      <Text variant="label" style={styles.gap}>
        {entries.length === 1 ? '1 entry' : `${entries.length} entries`} would be sent
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
          label={`Send ${entries.length} entries for an AI review`}
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
      {run.status === 'safety' && (
        <View style={styles.block}>
          <Notice tone="warn" title={ERROR_COPY.safety.title}>
            {ERROR_COPY.safety.body} Reaching a real person matters more than a review right now.
          </Notice>
          <Button variant="secondary" label="See support options" onPress={() => router.push('/support')} />
        </View>
      )}
      {run.status === 'ready' && <AiReview review={run.review} stored={run.stored} resolve={resolve} onSaveStep={onSaveStep} />}
    </View>
  );
}

function AiReview({ review, stored, resolve, onSaveStep }: { review: InsightReview; stored: boolean } & Pick<Props, 'resolve' | 'onSaveStep'>) {
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

const styles = StyleSheet.create({
  panel: { gap: space.xs, marginTop: space.xl, paddingTop: space.lg, borderTopWidth: 1, borderTopColor: color.sand },
  block: { gap: space.md, marginTop: space.sm },
  gap: { marginTop: space.xs },
  thin: { color: color.inkMuted },
});
