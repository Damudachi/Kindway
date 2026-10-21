import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type ScrollViewInstance } from 'react-native';

import { AiReviewPanel } from '@/components/ai-review-panel';
import { Button } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { InsightReviewView } from '@/components/insight-review';
import { Notice, StateView } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { Blaze } from '@/components/trail';
import { sameDay, weekDays } from '@/data/dates';
import { getInsightsService, type InsightPeriod, type SourceRef } from '@/services/insights';
import { analysableEntries, entriesInPeriod, insightsRequest } from '@/state/ai-context';
import { useEntries, useStore } from '@/state/demo-store';
import { useInsightsReview } from '@/state/use-insights';
import { color, space } from '@/theme/tokens';

const PERIODS: { id: InsightPeriod; label: string }[] = [
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'Last 30 days' },
  { id: 'all', label: 'All entries' },
];

/** Phrases that follow a count, e.g. "2 entries this week". */
const PERIOD_NAME: Record<InsightPeriod, string> = { week: 'this week', month: 'in the last 30 days', all: 'in your journal' };


export default function Patterns() {
  const { state } = useStore();
  const entries = useEntries();
  const [period, setPeriod] = useState<InsightPeriod>('week');
  const inPeriod = entriesInPeriod(entries, period);
  const usable = analysableEntries(entries, period);
  const keptOut = inPeriod.length - usable.length;

  // Re-run only when something the review counts changes.
  const key = [
    period,
    state.demo.ai,
    state.insightsUseCompass,
    state.compass.map((c) => `${c.id}${c.aiMayReference ? '+' : '-'}`).join(),
    usable.map((e) => `${e.id}:${e.feelings.join('/')}:${(e.compassIds ?? []).join('/')}:${e.revisit ? 'r' : ''}${e.gratitude ? 'g' : ''}`).join('|'),
  ].join('~');
  const [review, retry] = useInsightsReview(() => getInsightsService(state.demo.ai).review(insightsRequest(state, entries, period)), key);

  // This tab stays mounted. When a new review replaces a long one, start from the top
  // instead of leaving the view scrolled past the end of shorter content.
  const scroll = useRef<ScrollViewInstance>(null);
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [key]);

  if (!state.weeklyPatterns) {
    return (
      <Screen inTabs top={{ title: 'Patterns' }}>
        <StateView
          title="Patterns are off"
          body="Kindway won't look across your entries. Your journal works the same without it."
          action={<Button variant="secondary" label="Change in AI & memory" onPress={() => router.push('/settings/ai-memory')} />}
        />
        <Button variant="text" label="Preview sample insights" onPress={() => router.push('/sample')} />
      </Screen>
    );
  }

  const usableIds = new Set(usable.map((e) => e.id));
  const resolve = (ref: SourceRef) => (ref.kind === 'entry' && usableIds.has(ref.id) ? { onPress: () => router.push(`/entry/${ref.id}`) } : null);
  const sample = <Button variant="text" label="Preview sample insights" trailingIcon="arrow-right" onPress={() => router.push('/sample')} />;
  const write = <Button variant="secondary" label="Write a thought" onPress={() => router.push('/write')} />;

  let body;
  if (review.status === 'loading') {
    body = (
      <View style={styles.block} accessibilityLiveRegion="polite" accessibilityLabel="Looking across your entries">
        <Text variant="label">Looking across your entries…</Text>
        {[0.9, 0.7, 0.82].map((w, i) => (
          <View key={i} style={[styles.skeleton, { width: `${w * 100}%` }]} />
        ))}
      </View>
    );
  } else if (review.status === 'error') {
    body = (
      <View style={styles.block}>
        <Notice tone="warn" title="This review didn’t come through">
          Your entries are fine. Something went wrong putting the review together; you can try again.
        </Notice>
        <Button variant="secondary" label="Try again" icon="refresh" onPress={retry} />
      </View>
    );
  } else if (review.status === 'empty') {
    body = (
      <StateView
        title="Nothing to look across yet"
        body={
          keptOut > 0
            ? 'Every entry in this period is kept out of analysis. That’s your call, and it stays that way until you change it.'
            : `There are no entries ${PERIOD_NAME[period]}. There’s no pace to keep.`
        }
        action={
          <View style={styles.actions}>
            {write}
            {sample}
          </View>
        }
      />
    );
  } else if (review.status === 'insufficient') {
    body = (
      <StateView
        title="Not enough to go on yet"
        body={`There ${review.entryCount === 1 ? 'is 1 entry' : `are ${review.entryCount} entries`} to look at ${PERIOD_NAME[period]}. A review starts at ${review.needed}, so it doesn’t read too much into a few days. That’s a starting rule, not a target.`}
        action={sample}
      />
    );
  } else {
    body = (
      <View style={styles.block}>
        <Notice title="How this was made">
          These are counts of the feeling tags, compass links, good things and “come back to this” marks you added. Kindway doesn’t read or interpret your writing here. Nothing leaves this device.
        </Notice>
        <InsightReviewView
          review={review.review}
          resolve={resolve}
          // Opens Tomorrow Bridge to review the step first; nothing is saved from here.
          onSaveStep={(a) => router.push({ pathname: '/tomorrow', params: { suggestion: a.text, basis: 'tags', use: '1' } })}
        />
        {sample}
      </View>
    );
  }

  const days = weekDays();

  return (
    <Screen inTabs top={{ title: 'Patterns' }} scrollRef={scroll}>
      <Text variant="headline" accessibilityRole="header">
        Looking across your entries
      </Text>
      <Text variant="bodyMuted" style={styles.lede}>
        A few possible threads. You decide whether they fit.
      </Text>

      <View accessibilityRole="radiogroup" accessibilityLabel="Period">
        <ChipRow>
          {PERIODS.map((p) => (
            <Chip key={p.id} label={p.label} selected={period === p.id} onPress={() => setPeriod(p.id)} />
          ))}
        </ChipRow>
      </View>

      {period === 'week' && (
        // Every week is drawn on the same seven-day frame, so no week looks smaller.
        <View style={styles.week} accessibilityLabel={`This week: entries on ${days.filter((d) => entries.some((e) => sameDay(d, e.date))).length} of 7 days. There's no target.`}>
          {days.map((d) => (
            <View key={d.toISOString()} style={styles.day} importantForAccessibility="no-hide-descendants">
              <View style={styles.dayMark}>{entries.some((e) => sameDay(d, e.date)) && <Blaze />}</View>
              <Text variant="labelSmall">{d.toLocaleDateString('en-US', { weekday: 'narrow' })}</Text>
            </View>
          ))}
        </View>
      )}
      <Text variant="small" style={styles.count}>
        {inPeriod.length === 1 ? '1 entry' : `${inPeriod.length} entries`} {PERIOD_NAME[period]}
        {keptOut > 0 ? `, ${keptOut} kept out of analysis` : ''}. Writing on any number of days is fine.
      </Text>

      <View style={styles.content}>{body}</View>

      <AiReviewPanel
        period={period}
        entries={usable}
        // A stored AI review can outlive the current period; its sources stay openable while they exist and aren't kept out.
        resolve={(ref) => (ref.kind === 'entry' && entries.some((e) => e.id === ref.id && !e.excludeFromAnalysis) ? { onPress: () => router.push(`/entry/${ref.id}`) } : null)}
        onSaveStep={(a) => router.push({ pathname: '/tomorrow', params: { suggestion: a.text, basis: 'ai', use: '1' } })}
      />

      <Button variant="text" label="Choose which entries are used" onPress={() => router.push('/settings/ai-memory')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  lede: { marginTop: space.xs, marginBottom: space.md },
  week: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space.sm, borderTopWidth: 1, borderBottomWidth: 1, borderColor: color.sand, marginTop: space.sm },
  day: { alignItems: 'center', gap: space.xxs, width: 36 },
  dayMark: { height: 20, justifyContent: 'center' },
  count: { marginTop: space.xs },
  content: { marginTop: space.lg },
  block: { gap: space.md },
  actions: { gap: space.xs, alignItems: 'flex-start' },
  skeleton: { height: 14, borderRadius: 7, backgroundColor: color.sunk },
});
