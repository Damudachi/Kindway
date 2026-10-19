import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { useSnackbar } from '@/components/feedback';
import { Notice, StateView } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { Blaze } from '@/components/trail';
import { DEMO_NOW, sameDay, shortDate, weekDays } from '@/data/dates';
import type { Entry, InsightFeedback } from '@/data/types';
import type { AiError, Insight, SuggestedAction } from '@/services/ai';
import { useRequestWeeklyReview } from '@/state/actions';
import { weeklyEntries } from '@/state/ai-context';
import { useEntries, useStore } from '@/state/demo-store';
import { color, space } from '@/theme/tokens';

const RESPONSES: { id: InsightFeedback; label: string }[] = [
  { id: 'fits', label: 'That fits' },
  { id: 'partly', label: 'Partly' },
  { id: 'not', label: 'Not really' },
];

const ERRORS: Record<AiError, { title: string; body: string }> = {
  failed: { title: 'The weekly review didn’t come through', body: 'Your entries are fine. The review had a problem; you can try again now or later.' },
  rate: { title: 'Reviews are paused for a little while', body: 'You’ve reached the limit for now. You can look back on your week later.' },
  offline: { title: 'You’re offline', body: 'Looking back on your week needs a connection. Your entries are kept on this device.' },
};

const SECTIONS: { key: 'themes' | 'patterns' | 'strengths' | 'concerns'; title: string; none: string }[] = [
  { key: 'themes', title: 'Recurring themes', none: 'Nothing came up more than once.' },
  { key: 'patterns', title: 'Possible patterns', none: 'No links stood out this week.' },
  { key: 'strengths', title: 'Strengths and progress', none: 'None stood out in the words this week. That doesn’t mean there weren’t any.' },
  { key: 'concerns', title: 'Still open', none: 'Nothing looked unfinished.' },
];

export default function Patterns() {
  const { state } = useStore();
  const entries = useEntries();
  const request = useRequestWeeklyReview();
  const days = weekDays();
  const eligible = weeklyEntries(entries);
  const keptOut = weeklyEntries(entries.map((e) => ({ ...e, excludeFromAnalysis: false }))).length - eligible.length;
  const weekly = state.weekly;

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

  const write = <Button variant="secondary" label="Write a thought" onPress={() => router.push('/write')} />;

  let body;
  if (eligible.length === 0 || weekly.status === 'empty') {
    body = (
      <StateView
        title="Nothing to look back on yet"
        body={keptOut > 0 ? 'Every entry this week is kept out of analysis. That’s your call, and it stays that way until you change it.' : 'A weekly review starts once you’ve written this week. There’s no pace to keep.'}
        action={write}
      />
    );
  } else if (weekly.status === 'idle') {
    body = (
      <View style={styles.block}>
        <Text variant="body">When you’re ready, Kindway can look back across this week’s entries.</Text>
        <Text variant="small">
          It would read {eligible.length} {eligible.length === 1 ? 'entry' : 'entries'} from this week
          {keptOut > 0 ? `, not the ${keptOut} you kept out` : ''}
          {state.insightsUseCompass && state.compass.some((c) => c.aiMayReference) ? ', plus the compass values you allowed' : ''}. Nothing is analysed until you ask.
        </Text>
        <Button label="Look back on this week" icon="creation-outline" onPress={request} />
      </View>
    );
  } else if (weekly.status === 'loading') {
    body = (
      <View style={styles.block} accessibilityLiveRegion="polite" accessibilityLabel="Looking back on your week">
        <Text variant="label">Looking back on your week…</Text>
        {[0.9, 0.7, 0.82].map((w, i) => (
          <View key={i} style={[styles.skeleton, { width: `${w * 100}%` }]} />
        ))}
      </View>
    );
  } else if (weekly.status === 'error') {
    const copy = ERRORS[weekly.error];
    body = (
      <View style={styles.block}>
        <Notice tone="warn" title={copy.title}>
          {copy.body}
        </Notice>
        {weekly.error !== 'rate' && <Button variant="secondary" label="Try again" icon="refresh" onPress={request} />}
      </View>
    );
  } else if (weekly.status === 'insufficient') {
    body = (
      <StateView
        title="Not enough to go on yet"
        body={`There ${weekly.entryCount === 1 ? 'is 1 entry' : `are ${weekly.entryCount} entries`} to look at this week. Kindway waits for at least ${weekly.needed} before suggesting anything, so it doesn’t guess.`}
        action={
          <View style={styles.row}>
            {write}
            <Button variant="text" label="Check again" onPress={request} />
          </View>
        }
      />
    );
  } else {
    const { review } = weekly;
    const stale = weekly.entryIds.join() !== eligible.map((e) => e.id).join();
    body = (
      <View style={styles.block}>
        <Notice tone="demo" title="Simulated insights">
          No AI is connected. These were worked out on your device by matching words in your entries, to show how a weekly review would read. Treat them as examples, not analysis.
        </Notice>
        {stale && (
          <Notice title="Your entries changed since this review">
            Some links may be missing. Look again to include the changes.
          </Notice>
        )}
        {SECTIONS.map((s) => (
          <InsightSection key={s.key} title={s.title} none={s.none} insights={review[s.key]} eligible={eligible} />
        ))}
        <ActionSection actions={review.actions} eligible={eligible} />
        <Text variant="small">
          Based on {review.entryCount} {review.entryCount === 1 ? 'entry' : 'entries'} from {shortDate(review.from)} to {shortDate(review.to)}.
        </Text>
        <Button variant="text" label="Look again" icon="refresh" onPress={request} />
      </View>
    );
  }

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

      <View style={styles.content}>{body}</View>

      <Button variant="text" label="Choose which entries are used" onPress={() => router.push('/settings/ai-memory')} />
    </Screen>
  );
}

/** Evidence the user can still open; entries deleted or kept out since the review drop away. */
function sources(ids: string[], eligible: Entry[]) {
  return ids.map((id) => eligible.find((e) => e.id === id)).filter((e) => !!e);
}

function Sources({ entries }: { entries: Entry[] }) {
  return (
    <ChipRow>
      {entries.map((e) => (
        <Chip key={e.id} kind="assist" icon="notebook-outline" label={shortDate(e.date)} onPress={() => router.push(`/entry/${e.id}`)} />
      ))}
    </ChipRow>
  );
}

function InsightSection({ title, none, insights, eligible }: { title: string; none: string; insights: Insight[]; eligible: Entry[] }) {
  const { state } = useStore();
  const shown = insights.filter((i) => state.insightFeedback[i.id] !== 'hidden' && sources(i.evidence, eligible).length > 0);
  return (
    <View style={styles.section}>
      <Text variant="title" accessibilityRole="header">
        {title}
      </Text>
      {shown.length === 0 ? <Text variant="bodyMuted">{none}</Text> : shown.map((i) => <InsightItem key={i.id} insight={i} eligible={eligible} />)}
    </View>
  );
}

function InsightItem({ insight: ins, eligible }: { insight: Insight; eligible: Entry[] }) {
  const { state, dispatch } = useStore();
  const snack = useSnackbar();
  const fb = state.insightFeedback[ins.id];
  const inked = fb === 'fits' || fb === 'partly';
  const rejected = fb === 'not';
  return (
    <View style={styles.insight}>
      {/* Pencil until the user confirms it; ink once they say it fits. */}
      <Text variant={inked ? 'title' : 'pencil'} style={!inked && styles.pencilTitle}>
        {ins.title}
      </Text>
      {rejected ? (
        <Text variant="small">You said this doesn’t fit. Kindway won’t suggest it again.</Text>
      ) : (
        <>
          <Text variant="body">{ins.body}</Text>
          {ins.compassValue && <Text variant="labelSmall">Connects to your compass: {ins.compassValue}</Text>}
          <Text variant="label" style={styles.evidenceLabel}>
            Based on
          </Text>
          <Sources entries={sources(ins.evidence, eligible)} />
          <Text variant="small" style={styles.disclaimer}>
            An observation from your writing, not a diagnosis. It may be missing context.
          </Text>
        </>
      )}
      <ChipRow>
        {RESPONSES.map((r) => (
          <Chip key={r.id} label={r.label} selected={fb === r.id} onPress={() => dispatch({ type: 'insight', id: ins.id, feedback: fb === r.id ? undefined : r.id })} />
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
}

function ActionSection({ actions, eligible }: { actions: SuggestedAction[]; eligible: Entry[] }) {
  const { state, dispatch } = useStore();
  const snack = useSnackbar();
  const shown = actions.filter((a) => state.insightFeedback[a.id] !== 'hidden' && sources(a.evidence, eligible).length > 0);
  return (
    <View style={styles.section}>
      <Text variant="title" accessibilityRole="header">
        For next week, if you want
      </Text>
      {shown.length === 0 ? (
        <Text variant="bodyMuted">No suggestions this week. Nothing needs fixing.</Text>
      ) : (
        shown.map((a) => (
          <View key={a.id} style={styles.insight}>
            <Text variant="pencil" style={styles.pencilTitle}>
              {a.text}
            </Text>
            <Text variant="small">{a.why}</Text>
            <Sources entries={sources(a.evidence, eligible)} />
            <View style={styles.row}>
              <Button
                variant="secondary"
                label="Use as tomorrow’s step"
                onPress={() => {
                  dispatch({ type: 'patch', patch: { tomorrow: { text: a.text, savedOn: DEMO_NOW.toISOString(), status: 'open' } } });
                  snack({ message: 'Saved as an optional step for tomorrow.' });
                }}
              />
              <Button
                variant="text"
                label="Not for me"
                onPress={() => {
                  dispatch({ type: 'insight', id: a.id, feedback: 'hidden' });
                  snack({ message: 'Removed. Kindway won’t suggest it again.', action: { label: 'Undo', onPress: () => dispatch({ type: 'insight', id: a.id, feedback: undefined }) } });
                }}
              />
            </View>
          </View>
        ))
      )}
      {state.tomorrow?.status === 'open' && shown.length > 0 && <Text variant="small">Saving one replaces your current step for tomorrow.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  lede: { marginTop: space.xs, marginBottom: space.lg },
  week: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space.sm, borderTopWidth: 1, borderBottomWidth: 1, borderColor: color.sand, marginBottom: space.xs },
  day: { alignItems: 'center', gap: space.xxs, width: 36 },
  dayMark: { height: 20, justifyContent: 'center' },
  content: { marginTop: space.lg },
  block: { gap: space.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, alignItems: 'center' },
  section: { gap: space.xxs, paddingTop: space.md },
  insight: { paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: color.sand, gap: space.xxs },
  pencilTitle: { fontSize: 20, lineHeight: 28 },
  evidenceLabel: { marginTop: space.sm },
  disclaimer: { marginBottom: space.xxs },
  skeleton: { height: 14, borderRadius: 7, backgroundColor: color.sunk },
});
