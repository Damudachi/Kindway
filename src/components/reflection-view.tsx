import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

import { Button } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { useSnackbar } from '@/components/feedback';
import { Notice } from '@/components/notice';
import { Text } from '@/components/text';
import { shortDate } from '@/data/dates';
import { STYLE_LABEL } from '@/data/sample';
import type { Entry, ReflectionFeedback } from '@/data/types';
import { perspectiveCount } from '@/services/ai/mock-reflection';
import { useAnotherPerspective, useRequestReflection } from '@/state/actions';
import { useStore } from '@/state/demo-store';
import { color, radius, space } from '@/theme/tokens';

type Props = { entry: Entry; onRest: () => void };

const FEEDBACK: { id: ReflectionFeedback; label: string }[] = [
  { id: 'fits', label: 'This fits' },
  { id: 'not-quite', label: 'Doesn’t quite fit' },
];

/** The reflection layer of an entry, kept visibly separate from the user's own words. */
export function ReflectionView({ entry, onRest }: Props) {
  const { state, dispatch } = useStore();
  const request = useRequestReflection();
  const another = useAnotherPerspective();
  const snack = useSnackbar();
  const reduce = useReducedMotion();
  const r = entry.reflection;

  if (entry.reflectionStatus === 'loading') {
    return (
      <View style={styles.wrap} accessibilityLiveRegion="polite" accessibilityLabel="Preparing a reflection preview">
        <Text variant="label">Preparing a reflection preview…</Text>
        <View style={styles.skeletonGroup}>
          {[0.92, 0.78, 0.86, 0.6].map((w, i) => (
            <View key={i} style={[styles.skeleton, { width: `${w * 100}%` }]} />
          ))}
        </View>
        <Text variant="small">Your entry is already saved. You can leave this screen; nothing will be lost.</Text>
      </View>
    );
  }

  if (entry.reflectionStatus === 'failed' || entry.reflectionStatus === 'rate' || entry.reflectionStatus === 'offline') {
    const copy = {
      failed: { title: "The reflection didn't come through", body: 'Your entry is saved. The reflection had a problem; you can try again now or later.' },
      rate: { title: 'Reflections are paused for a little while', body: "You've reached the reflection limit for now. Your entry is saved, and you can reflect on it later." },
      offline: { title: "You're offline", body: 'Your entry is kept on this device. Reflections need a connection, so try again once you are back online.' },
    }[entry.reflectionStatus];
    return (
      <View style={styles.wrap}>
        <Notice tone="warn" title={copy.title}>
          {copy.body}
        </Notice>
        <View style={styles.row}>
          {entry.reflectionStatus !== 'rate' && <Button variant="secondary" label="Try again" icon="refresh" onPress={() => request(entry, r?.style)} />}
          <Button variant="text" label="Leave it for now" onPress={onRest} />
        </View>
      </View>
    );
  }

  if (!r) {
    return (
      <View style={styles.wrap}>
        {state.aiConsent === 'ai' ? (
          <>
            <Text variant="bodyMuted">No reflection on this entry. That’s fine; your words stand on their own.</Text>
            <Button variant="secondary" label="Reflect on this entry" icon="creation-outline" onPress={() => request(entry)} />
          </>
        ) : (
          <Text variant="bodyMuted">Reflection previews are off. Turn them on in AI & memory if you want them.</Text>
        )}
      </View>
    );
  }

  const edited = r.basedOn !== entry.body;
  // Interpretations stay in pencil until the user says they fit.
  const inked = r.feedback === 'fits';
  const related = (r.related ?? []).map((id) => state.entries.find((e) => e.id === id)).filter((e) => !!e);
  const used = ['this entry', r.longGame && 'one compass value you linked', related.length > 0 && `${related.length} earlier ${related.length === 1 ? 'entry' : 'entries'}`].filter(Boolean);
  const listening = r.style === 'listen';
  const perspectives = perspectiveCount(r.style, entry.feelings);

  const setFeedback = (feedback: ReflectionFeedback | undefined) =>
    dispatch({ type: 'updateEntry', id: entry.id, patch: { reflection: { ...r, feedback } } });

  const notRelevant = () => {
    dispatch({ type: 'updateEntry', id: entry.id, patch: { reflection: { ...r, longGame: undefined } } });
    snack({ message: 'Removed. Your compass stays as it is; this entry just isn’t linked to it here.' });
  };

  const remove = () => {
    dispatch({ type: 'removeReflection', id: entry.id });
    snack({ message: 'Reflection removed. Your entry is unchanged.', action: { label: 'Undo', onPress: () => dispatch({ type: 'setReflection', id: entry.id, status: 'ready', reflection: r }) } });
  };

  return (
    <Animated.View entering={reduce ? undefined : FadeIn.duration(360)} style={styles.wrap}>
      <View style={styles.simulated} accessibilityLabel="Preview response, simulated. Pre-written text chosen by your support style and tags. Nothing analysed your writing.">
        <MaterialCommunityIcons name="flask-outline" size={16} color={color.inkMuted} />
        <Text variant="labelSmall" style={styles.flex}>
          Preview response · simulated. Pre-written text chosen by your support style and tags; nothing analysed your writing.
        </Text>
      </View>

      {edited && (
        <Notice title="Based on an earlier version">
          You edited this entry after this reflection was written.
        </Notice>
      )}
      {edited && <Button variant="secondary" label="Reflect on this version" icon="refresh" onPress={() => request(entry, r.style)} />}

      <Text variant="entry">{r.acknowledge}</Text>

      {r.clarify && (
        <View style={styles.part}>
          <Text variant="title" accessibilityRole="header">What happened, and what you concluded</Text>
          <Text variant={inked ? 'body' : 'pencil'}>{r.clarify}</Text>
        </View>
      )}

      {r.perspective && (
        <View style={styles.part}>
          <Text variant="title" accessibilityRole="header">One possible way to see it</Text>
          <Text variant={inked ? 'body' : 'pencil'}>{r.perspective}</Text>
          {perspectives > 1 && <Button variant="text" label="Try another perspective" icon="sync" onPress={() => another(entry)} />}
        </View>
      )}

      {r.longGame && (
        <View style={styles.compass}>
          <Text variant="labelSmall" style={{ color: color.onTrailContainer }}>
            From your compass: {r.longGame.value}
          </Text>
          <Text variant="body" style={{ color: color.onTrailContainer }}>
            {r.longGame.text}
          </Text>
          <Button variant="text" label="Not relevant here" onPress={notRelevant} />
        </View>
      )}

      {related.length > 0 && (
        <View style={styles.part}>
          <Text variant="label">Other entries with a feeling tag in common</Text>
          <ChipRow>
            {related.map((e) => (
              <Chip key={e.id} kind="assist" icon="notebook-outline" label={shortDate(e.date)} onPress={() => router.push(`/entry/${e.id}`)} />
            ))}
          </ChipRow>
        </View>
      )}

      {r.nextStep && (
        <View style={styles.part}>
          <Text variant="title" accessibilityRole="header">If you want a next step</Text>
          <Text variant="pencil">{r.nextStep}</Text>
        </View>
      )}

      {r.question && (
        <Text variant="pencil" style={styles.question}>
          {r.question}
        </Text>
      )}

      <Text variant="small">
        Style: “{STYLE_LABEL[r.style]}”. Used: {used.join(', ')}.{related.length === 0 ? ' Past entries: not used.' : ''}
      </Text>

      <View style={styles.part}>
        <Text variant="label">Does this fit?</Text>
        <ChipRow>
          {FEEDBACK.map((f) => (
            <Chip key={f.id} label={f.label} selected={r.feedback === f.id} onPress={() => setFeedback(r.feedback === f.id ? undefined : f.id)} />
          ))}
        </ChipRow>
        {r.feedback === 'not-quite' && (
          <Text variant="small" accessibilityLiveRegion="polite">
            Noted on this entry. You know your situation better than any reflection. You can try another perspective, change the style, or leave it.
          </Text>
        )}
        {r.feedback === 'fits' && (
          <Text variant="small" accessibilityLiveRegion="polite">
            Noted on this entry.
          </Text>
        )}
      </View>

      <View style={styles.choices}>
        <Button label="Talk this through" trailingIcon="arrow-right" onPress={() => router.push(`/entry/${entry.id}/talk`)} />
        {!listening && <Button variant="secondary" label="Plan one small step for tomorrow" onPress={() => router.push(`/tomorrow?from=${entry.id}`)} />}
        <Button variant="text" label="Let this sit for tonight" onPress={onRest} />
      </View>

      <View style={styles.row}>
        <Button variant="text" label="Adjust how Kindway reflects" onPress={() => router.push('/settings/ai-memory')} />
        <Button variant="text" label="Remove this reflection" onPress={remove} />
      </View>

      <Text variant="small">
        Kindway is a reflection aid, not a therapist, and it can be wrong.{' '}
        <Text variant="small" style={styles.link} accessibilityRole="link" onPress={() => router.push('/support')}>
          Need more support?
        </Text>
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md, paddingVertical: space.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, alignItems: 'center' },
  part: { gap: space.xxs },
  flex: { flex: 1 },
  simulated: { flexDirection: 'row', gap: space.xs, alignItems: 'flex-start' },
  compass: { backgroundColor: color.trailContainer, borderRadius: radius.md, padding: space.md, gap: space.xxs },
  question: { fontSize: 18, lineHeight: 28 },
  choices: { gap: space.xs, marginTop: space.xs },
  link: { color: color.trail, textDecorationLine: 'underline' },
  skeletonGroup: { gap: space.xs },
  skeleton: { height: 14, borderRadius: 7, backgroundColor: color.sunk },
});
