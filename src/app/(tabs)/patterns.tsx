import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { useSnackbar } from '@/components/feedback';
import { Notice, StateView } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { Blaze } from '@/components/trail';
import { sameDay, shortDate, weekDays } from '@/data/dates';
import { SAMPLE_INSIGHTS } from '@/data/sample';
import type { InsightFeedback } from '@/data/types';
import { useEntries, useStore } from '@/state/demo-store';
import { color, space } from '@/theme/tokens';

const RESPONSES: { id: InsightFeedback; label: string }[] = [
  { id: 'fits', label: 'That fits' },
  { id: 'partly', label: 'Partly' },
  { id: 'not', label: 'Not really' },
];

export default function Patterns() {
  const { state, dispatch } = useStore();
  const entries = useEntries();
  const snack = useSnackbar();
  const days = weekDays();

  if (!state.weeklyPatterns) {
    return (
      <Screen inTabs top={{ title: 'Patterns' }}>
        <StateView
          title="Weekly patterns are off"
          body="Kindway won't look for themes across your entries. Your journal works the same without them."
          action={<Button variant="secondary" label="Change in AI & memory" onPress={() => router.push('/settings/ai-memory')} />}
        />
      </Screen>
    );
  }

  const insights = SAMPLE_INSIGHTS.filter((i) => state.insightFeedback[i.id] !== 'hidden' && i.evidence.some((id) => entries.some((e) => e.id === id)));

  return (
    <Screen inTabs top={{ title: 'Patterns' }}>
      <Text variant="headline" accessibilityRole="header">
        Your week in reflection
      </Text>
      <Text variant="bodyMuted" style={styles.lede}>
        A few possible threads from your recent entries. You decide whether they fit.
      </Text>

      {/* Every week is drawn on the same seven-day frame, so no week looks smaller. */}
      <View style={styles.week} accessibilityLabel={`This week: entries on ${days.filter((d) => entries.some((e) => sameDay(d, e.date))).length} of 7 days. There's no target.`}>
        {days.map((d) => {
          const has = entries.some((e) => sameDay(d, e.date));
          return (
            <View key={d.toISOString()} style={styles.day} importantForAccessibility="no-hide-descendants">
              <View style={styles.dayMark}>{has && <Blaze />}</View>
              <Text variant="labelSmall">{d.toLocaleDateString('en-US', { weekday: 'narrow' })}</Text>
            </View>
          );
        })}
      </View>
      <Text variant="small">{shortDate(days[0].toISOString())} – {shortDate(days[6].toISOString())}. Writing on any number of days is fine.</Text>

      {insights.length === 0 ? (
        <StateView title="No threads this week" body="Nothing stood out, or there isn't enough writing yet. That's okay." />
      ) : (
        insights.map((ins) => {
          const fb = state.insightFeedback[ins.id];
          const inked = fb === 'fits' || fb === 'partly';
          const rejected = fb === 'not';
          return (
            <View key={ins.id} style={styles.insight}>
              {/* Pencil until the user confirms it; ink once they say it fits. */}
              <Text variant={inked ? 'title' : 'pencil'} style={!inked && styles.pencilTitle}>
                {ins.title}
              </Text>
              {!rejected && <Text variant="body">{ins.body}</Text>}
              {rejected ? (
                <Text variant="small">You said this doesn’t fit. Kindway won’t suggest it again.</Text>
              ) : (
                <>
                  <Text variant="label" style={styles.evidenceLabel}>
                    {ins.kind}, based on
                  </Text>
                  <ChipRow>
                    {ins.evidence
                      .map((id) => entries.find((e) => e.id === id))
                      .filter((e) => !!e)
                      .map((e) => (
                        <Chip key={e.id} kind="assist" icon="notebook-outline" label={shortDate(e.date)} onPress={() => router.push(`/entry/${e.id}`)} />
                      ))}
                  </ChipRow>
                  <Text variant="small" style={styles.disclaimer}>
                    An observation from your writing, not a diagnosis. It may be missing context.
                  </Text>
                </>
              )}
              <ChipRow>
                {RESPONSES.map((r) => (
                  <Chip
                    key={r.id}
                    label={r.label}
                    selected={fb === r.id}
                    onPress={() => dispatch({ type: 'insight', id: ins.id, feedback: fb === r.id ? undefined : r.id })}
                  />
                ))}
              </ChipRow>
              <Button
                variant="text"
                label="Hide this"
                onPress={() => {
                  dispatch({ type: 'insight', id: ins.id, feedback: 'hidden' });
                  snack({ message: 'Hidden from your patterns.', action: { label: 'Undo', onPress: () => dispatch({ type: 'insight', id: ins.id, feedback: fb }) } });
                }}
              />
            </View>
          );
        })
      )}

      <Notice tone="demo">These patterns are pre-written examples. No analysis is running.</Notice>
      <Button variant="text" label="Manage insights and memory" onPress={() => router.push('/settings/ai-memory')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  lede: { marginTop: space.xs, marginBottom: space.lg },
  week: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space.sm, borderTopWidth: 1, borderBottomWidth: 1, borderColor: color.sand, marginBottom: space.xs },
  day: { alignItems: 'center', gap: space.xxs, width: 36 },
  dayMark: { height: 20, justifyContent: 'center' },
  insight: { paddingVertical: space.lg, borderBottomWidth: 1, borderBottomColor: color.sand, gap: space.xxs },
  pencilTitle: { fontSize: 20, lineHeight: 28 },
  evidenceLabel: { marginTop: space.sm },
  disclaimer: { marginBottom: space.xxs },
});
