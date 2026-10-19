import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { useSnackbar } from '@/components/feedback';
import { InsightReviewView } from '@/components/insight-review';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { Trail, TrailStop } from '@/components/trail';
import { shortDate } from '@/data/dates';
import { SAMPLE_ENTRIES } from '@/data/sample';
import { createSampleInsightsService, type SourceRef } from '@/services/insights';
import { toContext } from '@/state/ai-context';
import { useStore } from '@/state/demo-store';
import { useInsightsReview } from '@/state/use-insights';
import { space } from '@/theme/tokens';

const isSample = (id: string) => id.startsWith('sample:');

/** A separate, clearly fictional demo of how an AI insight review could read. Never touches the user's journal. */
export default function SampleInsights() {
  const { state, dispatch } = useStore();
  const snack = useSnackbar();
  const [review] = useInsightsReview(
    () =>
      createSampleInsightsService().review({
        period: 'week',
        entries: SAMPLE_ENTRIES.map(toContext),
        compass: [],
        excludeIds: Object.entries(state.insightFeedback)
          .filter(([id, fb]) => isSample(id) && (fb === 'not' || fb === 'hidden'))
          .map(([id]) => id),
      }),
    'sample',
  );
  const resolve = (ref: SourceRef) => (ref.kind === 'sample' ? { onPress: () => router.push(`/sample/${ref.id}`) } : null);
  const sampleFeedback = Object.keys(state.insightFeedback).filter(isSample);

  return (
    <Screen top={{ back: true, title: 'Sample insights' }}>
      <Text variant="headline" accessibilityRole="header">
        A preview, with made-up entries
      </Text>
      <Notice tone="demo" title="Fictional examples">
        These entries and insights are invented to show how a future AI review could read. They aren’t about you, weren’t produced by AI, and never mix with your journal. Feedback here is kept separately.
      </Notice>

      <Text variant="title" accessibilityRole="header" style={styles.heading}>
        Sample entries
      </Text>
      <Trail>
        {SAMPLE_ENTRIES.map((e, i) => (
          <TrailStop
            key={e.id}
            blaze="painted"
            last={i === SAMPLE_ENTRIES.length - 1}
            onPress={() => router.push(`/sample/${e.id}`)}
            accessibilityLabel={`Sample entry, ${shortDate(e.date)}: ${e.title}. Open.`}>
            <Text variant="labelSmall">Sample · {shortDate(e.date)}</Text>
            <Text variant="entryTitle">{e.title}</Text>
          </TrailStop>
        ))}
      </Trail>

      <Text variant="title" accessibilityRole="header" style={styles.heading}>
        Sample review
      </Text>
      {review.status === 'ready' ? (
        <InsightReviewView review={review.review} resolve={resolve} />
      ) : (
        <Text variant="label" accessibilityLiveRegion="polite">
          Loading the sample…
        </Text>
      )}

      <View style={styles.footer}>
        {sampleFeedback.length > 0 && (
          <Button
            variant="text"
            label="Clear my feedback on samples"
            onPress={() => {
              for (const id of sampleFeedback) dispatch({ type: 'insight', id, feedback: undefined });
              snack({ message: 'Sample feedback cleared. Reopen this page to see every sample again.' });
            }}
          />
        )}
        <Button variant="text" label="Back to my patterns" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { marginTop: space.lg, marginBottom: space.xs },
  footer: { marginTop: space.md },
});
