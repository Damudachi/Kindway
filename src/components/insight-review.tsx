import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { useSnackbar } from '@/components/feedback';
import { SectionTitle } from '@/components/illustrations';
import { Text } from '@/components/text';
import { shortDate } from '@/data/dates';
import type { InsightFeedback } from '@/data/types';
import type { Insight, InsightReview, SourceRef, SuggestedAction } from '@/services/insights';
import { useStore } from '@/state/demo-store';
import { makeStyles } from '@/theme/theme';
import { space } from '@/theme/tokens';

const RESPONSES: { id: InsightFeedback; label: string }[] = [
  { id: 'fits', label: 'Fits' },
  { id: 'partly', label: 'Partly fits' },
  { id: 'not', label: 'Doesn’t fit' },
];

const SECTIONS: { key: 'themes' | 'patterns' | 'strengths' | 'concerns'; title: string; none: string }[] = [
  { key: 'themes', title: 'Recurring themes', none: 'Nothing came up more than once.' },
  { key: 'patterns', title: 'Possible patterns', none: 'No tags showed up together often enough to mention.' },
  { key: 'strengths', title: 'Strengths and progress', none: 'Nothing to count here this time. That doesn’t mean there wasn’t any.' },
  { key: 'concerns', title: 'Still open', none: 'Nothing marked to come back to. Use “Come back to this” on an entry if you want it here.' },
];

type Props = {
  review: InsightReview;
  /** Turns a source into a tappable chip, or null when it no longer exists or is kept out. */
  resolve: (ref: SourceRef) => { onPress: () => void } | null;
  /** Saves a suggestion as the Tomorrow Bridge step. Omitted for the sample demo. */
  onSaveStep?: (action: SuggestedAction) => void;
};

/** One insight review, shared by the user's own Patterns and the fictional sample demo. */
export function InsightReviewView({ review, resolve, onSaveStep }: Props) {
  const styles = useStyles();
  return (
    <View style={styles.block}>
      {SECTIONS.map((s) => (
        // The default "none" texts describe tag counts; an AI review needs a plainer one.
        <InsightSection key={s.key} title={s.title} none={review.basis === 'ai' ? 'Nothing here this time.' : s.none} insights={review[s.key]} resolve={resolve} />
      ))}
      <ActionSection actions={review.actions} resolve={resolve} onSaveStep={onSaveStep} />
    </View>
  );
}

function Sources({ refs, resolve }: { refs: SourceRef[]; resolve: Props['resolve'] }) {
  return (
    <ChipRow>
      {refs.flatMap((ref) => {
        const target = resolve(ref);
        if (!target) return [];
        const label = `${ref.kind === 'sample' ? 'Sample · ' : ''}${shortDate(ref.date)}`;
        return [<Chip key={`${ref.kind}:${ref.id}`} kind="assist" icon="notebook-outline" label={label} onPress={target.onPress} />];
      })}
    </ChipRow>
  );
}

const live = (refs: SourceRef[], resolve: Props['resolve']) => refs.some((r) => resolve(r));

function InsightSection({ title, none, insights, resolve }: { title: string; none: string; insights: Insight[]; resolve: Props['resolve'] }) {
  const styles = useStyles();
  const { state } = useStore();
  // An insight whose sources were all deleted or kept out has nothing left to stand on.
  const shown = insights.filter((i) => state.insightFeedback[i.id] !== 'hidden' && live(i.sources, resolve));
  return (
    <View style={styles.section}>
      <SectionTitle pencil>{title}</SectionTitle>
      {shown.length === 0 ? (
        <Text variant="bodyMuted">{none}</Text>
      ) : (
        // A short fade-up on first render, one after another; feedback changes don't replay it.
        shown.map((i, n) => (
          <Animated.View key={i.id} entering={FadeInDown.duration(250).delay(n * 40)}>
            <InsightItem insight={i} resolve={resolve} />
          </Animated.View>
        ))
      )}
    </View>
  );
}

function InsightItem({ insight: ins, resolve }: { insight: Insight; resolve: Props['resolve'] }) {
  const styles = useStyles();
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
        <Text variant="small">You said this doesn’t fit. It won’t be offered again.</Text>
      ) : (
        <>
          {ins.grounding && <Text variant="labelSmall">{ins.grounding === 'observed' ? 'Seen in what you wrote or tagged' : 'One possible reading. You may see it differently.'}</Text>}
          <Text variant="body">{ins.body}</Text>
          {ins.compassValue && <Text variant="labelSmall">Connects to a compass value: {ins.compassValue}</Text>}
          <Text variant="label" style={styles.evidenceLabel}>
            From
          </Text>
          <Sources refs={ins.sources} resolve={resolve} />
        </>
      )}
      <ChipRow>
        {RESPONSES.map((r) => (
          <Chip key={r.id} label={r.label} selected={fb === r.id} onPress={() => dispatch({ type: 'insight', id: ins.id, feedback: fb === r.id ? undefined : r.id })} />
        ))}
      </ChipRow>
      <Button
        variant="text"
        label="Hide"
        onPress={() => {
          dispatch({ type: 'insight', id: ins.id, feedback: 'hidden' });
          snack({ message: 'Hidden.', action: { label: 'Undo', onPress: () => dispatch({ type: 'insight', id: ins.id, feedback: fb }) } });
        }}
      />
    </View>
  );
}

function ActionSection({ actions, resolve, onSaveStep }: { actions: SuggestedAction[]; resolve: Props['resolve']; onSaveStep?: Props['onSaveStep'] }) {
  const styles = useStyles();
  const { state, dispatch } = useStore();
  const snack = useSnackbar();
  const shown = actions.filter((a) => state.insightFeedback[a.id] !== 'hidden' && live(a.sources, resolve));
  return (
    <View style={styles.section}>
      <SectionTitle icon="stairs-up" pencil>
        If you want a next step
      </SectionTitle>
      {shown.length === 0 ? (
        <Text variant="bodyMuted">No suggestions this time. Nothing needs fixing.</Text>
      ) : (
        shown.map((a) => (
          <View key={a.id} style={styles.insight}>
            <Text variant="pencil" style={styles.pencilTitle}>
              {a.text}
            </Text>
            <Text variant="small">{a.why}</Text>
            <Sources refs={a.sources} resolve={resolve} />
            <View style={styles.row}>
              {onSaveStep && <Button variant="secondary" label="Save as tomorrow’s step" onPress={() => onSaveStep(a)} />}
              <Button
                variant="text"
                label="Not for me"
                onPress={() => {
                  dispatch({ type: 'insight', id: a.id, feedback: 'hidden' });
                  snack({ message: 'Removed. It won’t be suggested again.', action: { label: 'Undo', onPress: () => dispatch({ type: 'insight', id: a.id, feedback: undefined }) } });
                }}
              />
            </View>
          </View>
        ))
      )}
      <Text variant="small">Rest, waiting, or leaving things be are all reasonable choices too.</Text>
      {onSaveStep && shown.length > 0 && <Text variant="small">You’ll see a step in Tomorrow Bridge before it’s saved, and you can change it there.</Text>}
    </View>
  );
}

const useStyles = makeStyles((color) => ({
  block: { gap: space.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, alignItems: 'center' },
  section: { gap: space.xxs, paddingTop: space.md },
  insight: { paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: color.sand, gap: space.xxs },
  pencilTitle: { fontSize: 20, lineHeight: 28 },
  evidenceLabel: { marginTop: space.sm },
}));
