import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

import { AiUnavailableNote } from '@/components/ai-unavailable';
import { Button } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { useSnackbar } from '@/components/feedback';
import { Notice } from '@/components/notice';
import { Text } from '@/components/text';
import { shortDate } from '@/data/dates';
import { STYLE_LABEL } from '@/data/sample';
import type { Entry, ReflectionFeedback } from '@/data/types';
import { perspectiveCount } from '@/services/ai/mock-reflection';
import { useAnotherPerspective, useReflectionMode, useRequestReflection } from '@/state/actions';
import { useStore } from '@/state/demo-store';
import { useRealAi } from '@/state/real-ai';
import { fitStep } from '@/state/tomorrow';
import { makeStyles, useTheme } from '@/theme/theme';
import { radius, space, touch } from '@/theme/tokens';

type Props = { entry: Entry; onRest: () => void };

type Failure = Exclude<Entry['reflectionStatus'], 'none' | 'loading' | 'ready'>;

/** What each failed request says. None is shown as a reflection, and the entry is always kept. */
const FAILURE: Record<Failure, { title: string; body: string; retry: boolean }> = {
  failed: { title: 'The reflection didn’t come through', body: 'Your entry is saved. The reflection had a problem; you can try again now or later.', retry: true },
  rate: { title: 'Reflections are paused for a little while', body: 'You’ve reached the reflection limit for now. Your entry is saved, and you can reflect on it later.', retry: false },
  offline: { title: 'You’re offline', body: 'Your entry is kept on this device. Reflections need a connection, so try again once you are back online.', retry: true },
  timeout: { title: 'The AI took too long to answer', body: 'Your entry is saved and nothing was written about it. You can try again.', retry: true },
  unavailable: { title: 'AI reflections aren’t available right now', body: 'The AI service couldn’t be reached. Your entry is saved; try again later.', retry: true },
  invalid: { title: 'The AI’s reply couldn’t be used', body: 'It didn’t come back in a form Kindway can check, so it isn’t shown. Your entry is saved; you can try again.', retry: true },
  consent: { title: 'AI reflections aren’t allowed on this account', body: 'Nothing was sent. You can allow reflections on an entry in AI processing settings, or keep journaling without AI.', retry: false },
  'not-synced': { title: 'Your entry hasn’t reached your account yet', body: 'AI reads the copy in your account, so it waits for cloud backup. Nothing was sent. Try again in a moment.', retry: true },
  'too-long': { title: 'This entry is too long for an AI reflection', body: 'AI reflections accept entries up to 8,000 characters. Nothing was sent, and your entry is unchanged.', retry: false },
  busy: { title: 'Another AI request is still running', body: 'Kindway handles one AI request at a time. Your entry is saved; try again in a moment.', retry: true },
  safety: {
    title: 'Kindway didn’t write a reflection for this one',
    body: 'Something in this entry sounded like it might be heavy or unsafe. Reaching a real person matters more than a reflection right now.',
    retry: false,
  },
};

const FEEDBACK: { id: ReflectionFeedback; label: string }[] = [
  { id: 'fits', label: 'This fits' },
  { id: 'not-quite', label: 'Doesn’t quite fit' },
];

/** The reflection layer of an entry, kept visibly separate from the user's own words. */
export function ReflectionView({ entry, onRest }: Props) {
  const styles = useStyles();
  const { color } = useTheme();
  const { state, dispatch } = useStore();
  const request = useRequestReflection();
  const another = useAnotherPerspective();
  const snack = useSnackbar();
  const reduce = useReducedMotion();
  const mode = useReflectionMode();
  const real = useRealAi();
  const [aboutOpen, setAboutOpen] = useState(false);
  const r = entry.reflection;

  if (entry.reflectionStatus === 'loading') {
    const label = mode === 'ai' ? 'Asking AI for a reflection…' : 'Preparing a reflection preview…';
    return (
      <View style={styles.wrap} accessibilityLiveRegion="polite" accessibilityLabel={label}>
        <Text variant="label">{label}</Text>
        <View style={styles.skeletonGroup}>
          {[0.92, 0.78, 0.86, 0.6].map((w, i) => (
            <View key={i} style={[styles.skeleton, { width: `${w * 100}%` }]} />
          ))}
        </View>
        <Text variant="small">Your entry is already saved. You can leave this screen; nothing will be lost.</Text>
      </View>
    );
  }

  if (entry.reflectionStatus in FAILURE) {
    const status = entry.reflectionStatus as Failure;
    const copy = FAILURE[status];
    // A real-AI failure never turns into a simulated reply by itself; the user can ask for one.
    const offerPreview = mode === 'ai' && state.aiConsent === 'ai' && status !== 'safety';
    return (
      <View style={styles.wrap}>
        <Notice tone="warn" title={copy.title}>
          {copy.body}
        </Notice>
        <View style={styles.row}>
          {copy.retry && <Button variant="secondary" label="Try again" icon="refresh" onPress={() => request(entry, r?.style)} />}
          {status === 'safety' && <Button variant="secondary" label="See support options" onPress={() => router.push('/support')} />}
          {status === 'consent' && <Button variant="secondary" label="AI processing settings" onPress={() => router.push('/settings/ai-consent')} />}
          {offerPreview && <Button variant="text" label="Use a simulated preview instead" onPress={() => request(entry, r?.style, 0, { simulated: true })} />}
          <Button variant="text" label="Leave it for now" onPress={onRest} />
        </View>
      </View>
    );
  }

  if (!r) {
    return (
      <View style={styles.wrap}>
        {mode !== 'off' ? (
          <>
            <Text variant="bodyMuted">No reflection on this entry. That’s fine; your words stand on their own.</Text>
            <Button variant="secondary" label={mode === 'ai' ? 'Reflect on this entry with AI' : 'Reflect on this entry'} icon="creation-outline" onPress={() => request(entry)} />
            {mode === 'ai' ? <Text variant="small">Sends this entry, its tags and good thing to GroqCloud.</Text> : <AiUnavailableNote scope="entry_reflection" />}
          </>
        ) : (
          <Text variant="bodyMuted">Reflection previews are off. Turn them on in AI & memory if you want them.</Text>
        )}
      </View>
    );
  }

  const isAi = r.source === 'ai';
  // Only a structured next step is offered for Tomorrow Bridge; nothing is read out of the other parts.
  const nextStep = r.nextStep?.trim() || null;
  const step = state.tomorrow;
  const stepSaved =
    !!nextStep && step?.status === 'open' && step.source?.kind === 'reflection' && step.source.entryId === entry.id && step.text === fitStep(nextStep).text;
  const edited = r.basedOn !== entry.body;
  // Interpretations stay in pencil until the user says they fit.
  const inked = r.feedback === 'fits';
  const related = (r.related ?? []).map((id) => state.entries.find((e) => e.id === id)).filter((e) => !!e);
  const used = ['this entry', r.longGame && 'one compass value you linked', related.length > 0 && `${related.length} earlier ${related.length === 1 ? 'entry' : 'entries'}`].filter(Boolean);
  const listening = r.style === 'listen';
  // A real AI reflection can be asked for again (a new request); simulated ones cycle pre-written text.
  const perspectives = isAi ? (real.reflections ? 2 : 0) : perspectiveCount(r.style, entry.feelings);

  const setFeedback = (feedback: ReflectionFeedback | undefined) =>
    dispatch({ type: 'updateEntry', id: entry.id, patch: { reflection: { ...r, feedback } } });

  const notRelevant = () => {
    dispatch({ type: 'updateEntry', id: entry.id, patch: { reflection: { ...r, longGame: undefined } } });
    snack({ message: 'Removed. Your compass stays as it is; this entry just isn’t linked to it here.' });
  };

  const remove = () => {
    if (isAi && r.ai) {
      // Also deleted from the account, so there's no undo.
      const id = r.ai.id;
      dispatch({ type: 'removeReflection', id: entry.id });
      void (real.outputs ? real.outputs.deleteReflection(id) : Promise.reject(new Error('unavailable')))
        .then(() => snack({ message: 'Reflection deleted from this device and your account. Your entry is unchanged.' }))
        .catch(() => snack({ message: 'Removed here, but it couldn’t be deleted from your account yet. You can delete all AI outputs in AI processing settings.' }));
      return;
    }
    dispatch({ type: 'removeReflection', id: entry.id });
    snack({ message: 'Reflection removed. Your entry is unchanged.', action: { label: 'Undo', onPress: () => dispatch({ type: 'setReflection', id: entry.id, status: 'ready', reflection: r }) } });
  };

  return (
    <Animated.View entering={reduce ? undefined : FadeIn.duration(360)} style={styles.wrap}>
      {isAi ? (
        <View style={styles.simulated} accessible accessibilityLabel={`Written by AI, ${r.ai?.model ?? 'an AI model'} on GroqCloud, from this entry. Not written by you or a person, and it can be wrong.`}>
          <MaterialCommunityIcons name="creation-outline" size={16} color={color.inkMuted} />
          <Text variant="labelSmall" style={styles.flex}>
            Written by AI ({r.ai?.model ?? 'AI model'} on GroqCloud) from this entry. Not written by you or a person, and it can be wrong.
          </Text>
        </View>
      ) : (
        <View style={styles.simulated} accessibilityLabel="Preview response, simulated. Pre-written text chosen by your support style and tags. Nothing analysed your writing.">
          <MaterialCommunityIcons name="flask-outline" size={16} color={color.inkMuted} />
          <Text variant="labelSmall" style={styles.flex}>
            Preview response · simulated. Pre-written text chosen by your support style and tags; nothing analysed your writing.
          </Text>
        </View>
      )}
      <Text variant="small">
        Style: “{STYLE_LABEL[r.style]}”. {isAi ? 'Sent' : 'Used'}: {used.join(', ')}.{related.length === 0 ? ' Past entries: not used.' : ''}
      </Text>
      {!isAi && <AiUnavailableNote scope="entry_reflection" />}

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
          {perspectives > 1 && <Button variant="text" label={isAi ? 'Ask AI for another perspective' : 'Try another perspective'} icon="sync" onPress={() => another(entry)} />}
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

      {nextStep && (
        <View style={styles.part}>
          <Text variant="title" accessibilityRole="header">If you want a next step</Text>
          <Text variant="pencil">{nextStep}</Text>
          {stepSaved ? (
            <Text variant="small" accessibilityLiveRegion="polite">
              Saved to Tomorrow Bridge. You can change it or let it go on Today.
            </Text>
          ) : (
            <Button
              variant="text"
              label="Save to Tomorrow Bridge"
              accessibilityHint="Opens Tomorrow Bridge with this step filled in. You can edit it, and nothing is saved until you choose to."
              onPress={() => router.push(`/tomorrow?from=${entry.id}&use=1`)}
            />
          )}
        </View>
      )}

      {r.question && (
        <Text variant="pencil" style={styles.question}>
          {r.question}
        </Text>
      )}

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
        {/* A suggested next step already offers Tomorrow Bridge above; this is the way in without one. */}
        {!listening && !nextStep && <Button variant="secondary" label="Plan one small step for tomorrow" onPress={() => router.push(`/tomorrow?from=${entry.id}`)} />}
        <Button variant="text" label="Let this sit for tonight" onPress={onRest} />
      </View>

      <View style={styles.about}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="About this reflection"
          accessibilityState={{ expanded: aboutOpen }}
          onPress={() => setAboutOpen((open) => !open)}
          style={styles.aboutToggle}>
          <Text variant="label" style={styles.flex}>
            About this reflection
          </Text>
          <MaterialCommunityIcons name={aboutOpen ? 'chevron-up' : 'chevron-down'} size={20} color={color.inkMuted} />
        </Pressable>
        {aboutOpen && (
          <View style={styles.part}>
            <Text variant="small">Kindway is a reflection aid, not a therapist, and it can be wrong.</Text>
            <View style={styles.row}>
              <Button variant="text" label="Adjust how Kindway reflects" onPress={() => router.push('/settings/ai-memory')} />
              <Button variant="text" label="Remove this reflection" onPress={remove} />
            </View>
          </View>
        )}
        {/* Support is never folded away. */}
        <Text variant="small" style={styles.link} accessibilityRole="link" onPress={() => router.push('/support')}>
          Need more support?
        </Text>
      </View>
    </Animated.View>
  );
}

const useStyles = makeStyles((color) => ({
  wrap: { gap: space.md, paddingVertical: space.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, alignItems: 'center' },
  part: { gap: space.xxs },
  flex: { flex: 1 },
  simulated: { flexDirection: 'row', gap: space.xs, alignItems: 'flex-start' },
  compass: { backgroundColor: color.trailContainer, borderRadius: radius.md, padding: space.md, gap: space.xxs },
  question: { fontSize: 18, lineHeight: 28 },
  choices: { gap: space.xs, marginTop: space.xs },
  about: { borderTopWidth: 1, borderTopColor: color.sand, paddingTop: space.xs, gap: space.xs },
  aboutToggle: { flexDirection: 'row', alignItems: 'center', minHeight: touch },
  link: { color: color.trail, textDecorationLine: 'underline' },
  skeletonGroup: { gap: space.xs },
  skeleton: { height: 14, borderRadius: 7, backgroundColor: color.sunk },
}));
