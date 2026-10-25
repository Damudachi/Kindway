import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { EveningGlow } from '@/components/brand';
import { Button, IconButton } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { Dialog, useSnackbar } from '@/components/feedback';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { SectionTitle } from '@/components/illustrations';
import { Text } from '@/components/text';
import { Feelings, Trail, TrailStop } from '@/components/trail';
import { daysAgo, longDate, now, partOfDay, relativeDay } from '@/data/dates';
import { HOME_PROMPTS } from '@/data/sample';
import { useSync } from '@/state/cloud-sync';
import { useEntries, useStore } from '@/state/demo-store';
import { useSession } from '@/state/session';
import { markDone, postpone, setOutcome, stepView } from '@/state/tomorrow';
import { makeStyles, useTheme } from '@/theme/theme';
import { space } from '@/theme/tokens';

export default function Today() {
  const styles = useStyles();
  const { color, tint } = useTheme();
  const { state, dispatch } = useStore();
  const entries = useEntries();
  const snack = useSnackbar();
  const { mode } = useSession();
  const sync = useSync();
  const [backupLater, setBackupLater] = useState(false);
  const [signInLater, setSignInLater] = useState(false);
  const [focused, setFocused] = useState(false);
  const [stepOpen, setStepOpen] = useState(false);
  // The step blaze fills in lichen right after it's marked done.
  const [stepPainting, setStepPainting] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const when = partOfDay() === 'evening' ? 'tonight' : 'today';
  const today = now();
  const prompt = HOME_PROMPTS[today.getDate() % HOME_PROMPTS.length];
  const todays = entries.filter((e) => daysAgo(e.date) === 0);
  const earlier = entries.filter((e) => daysAgo(e.date) > 0).slice(0, 2);
  const step = state.tomorrow;
  const view = stepView(step, today);
  const setStep = (next: typeof step, message: string, undo = true) => {
    const before = step;
    dispatch({ type: 'tomorrow', step: next });
    setStepOpen(false);
    snack({ message, action: undo ? { label: 'Undo', onPress: () => dispatch({ type: 'tomorrow', step: before }) } : undefined });
  };
  const hasDraft = state.draft.text.trim().length > 0 && !state.draft.editingId;

  const usePrompt = () => {
    if (!hasDraft) dispatch({ type: 'draft', patch: { text: `${prompt}\n\n` } });
    router.push('/write');
  };

  return (
    <Screen inTabs top={{ wordmark: true, actions: <IconButton icon="cog-outline" label="Settings" onPress={() => router.push('/settings')} /> }}
      backdrop={<EveningGlow />}>
      {state.demo.ai === 'offline' && (
        <View style={styles.banner}>
          <Notice tone="info" icon="wifi-off" title="You're offline">
            You can still write. Entries are kept on this device until you’re back online.
          </Notice>
        </View>
      )}

      {mode === 'signed-in-local' && !backupLater && (
        <View style={styles.banner}>
          <Notice title="Not backed up">Your journal is only on this device. You can keep it that way, or back it up to your account.</Notice>
          <View style={styles.bannerActions}>
            <Button variant="text" label="Back up" onPress={() => router.push('/sync')} />
            <Button variant="text" label="Not now" onPress={() => setBackupLater(true)} />
          </View>
        </View>
      )}
      {sync && (sync.status === 'offline' || sync.status === 'error') && sync.pending > 0 && (
        <View style={styles.banner}>
          <Notice tone="info" icon="cloud-off-outline" title="Not backed up yet">
            {sync.status === 'offline' ? 'You’re offline.' : 'Your account couldn’t be reached.'} Recent changes are safe on this device and will back up automatically.
          </Notice>
        </View>
      )}

      {state.onboarded && entries.length > 0 && !state.reminders.offered && !state.reminders.enabled && state.reminders.permission === 'unasked' && (
        <View style={styles.banner}>
          <Notice icon="bell-outline" title="Would a gentle nudge help?">
            One quiet evening reminder, with nothing from your entries. Skipping a day is always fine.
          </Notice>
          <View style={styles.bannerActions}>
            <Button
              variant="text"
              label="Set a reminder"
              onPress={() => {
                dispatch({ type: 'reminders', patch: { offered: true } });
                router.push('/settings/reminders');
              }}
            />
            <Button variant="text" label="No thanks" onPress={() => dispatch({ type: 'reminders', patch: { offered: true } })} />
          </View>
        </View>
      )}

      <Text variant="display" accessibilityRole="header">
        How are you arriving {when}?
      </Text>
      <Text variant="bodyMuted" style={styles.lede}>
        Start anywhere. It doesn’t need to make sense yet.
      </Text>
      <Text variant="small" style={styles.date}>
        {longDate(today.toISOString())}
      </Text>

      <Button
        label={hasDraft ? 'Continue your draft' : 'Write a thought'}
        icon="feather"
        trailingIcon="arrow-right"
        accent
        onPress={() => router.push('/write')}
        style={styles.write}
      />
      <ChipRow>
        <Chip kind="assist" icon="microphone-outline" label="Speak" onPress={() => router.push('/voice')} />
        <Chip kind="assist" icon="lightbulb-on-outline" label={`“${prompt}”`} onPress={usePrompt} />
      </ChipRow>

      <View style={styles.section}>
        <SectionTitle icon="map-marker-path" style={styles.trailTitle}>
          Your trail
        </SectionTitle>
        {/* Draws in once a day, and again as it extends to a newly saved entry. */}
        <Trail drawKey={state.justPainted ? `paint:${state.justPainted}` : `day:${today.toDateString()}`}>
          {todays.length === 0 ? (
            <TrailStop
              blaze="open"
              onPress={() => router.push('/write')}
              accessibilityLabel={`Tonight, not written yet. Write a thought.`}>
              <Text variant="labelSmall">Tonight</Text>
              <Text variant="entryTitle">Not written yet. Whenever you’re ready.</Text>
            </TrailStop>
          ) : (
            todays.map((e) => (
              <TrailStop
                key={e.id}
                blaze="painted"
                tint={tint.feeling(e.feelings[0]).mark}
                paint={focused && state.justPainted === e.id}
                onPainted={() => dispatch({ type: 'patch', patch: { justPainted: undefined } })}
                onPress={() => router.push(`/entry/${e.id}`)}
                accessibilityLabel={`Today: ${e.title}. Open entry.`}>
                <Text variant="labelSmall">Today</Text>
                <Text variant="entryTitle">{e.title}</Text>
                <Feelings names={e.feelings} />
              </TrailStop>
            ))
          )}
          {step && view !== 'hidden' && (
            <TrailStop
              blaze={view === 'done' ? 'painted' : 'next'}
              tint={color.lichen}
              paint={view === 'done' && stepPainting}
              onPainted={() => setStepPainting(false)}
              accessibilityLabel={`${view === 'done' ? 'Done today' : view === 'due' ? 'Today' : 'Tomorrow'}, optional step: ${step.text}`}>
              <Text variant="labelSmall">{view === 'done' ? 'Done today' : view === 'due' ? 'Your small step · optional' : 'Tomorrow · optional'}</Text>
              <Text variant="entryTitle">{step.text}</Text>
              {view === 'due' &&
                (stepOpen ? (
                  <>
                    <Text variant="small" style={styles.stepAsk}>
                      However it went is fine. There’s nothing to keep up.
                    </Text>
                    <ChipRow>
                      <Chip
                        kind="assist"
                        icon="check"
                        label="Done"
                        onPress={() => {
                          setStepPainting(true);
                          setStep(markDone(step), 'Marked done. Small steps count.');
                        }}
                      />
                      <Chip kind="assist" icon="calendar-arrow-right" label="Move to tomorrow" onPress={() => setStep(postpone(step), 'Moved to tomorrow. Nothing is lost.')} />
                      <Chip kind="assist" icon="pencil-outline" label="Edit" onPress={() => router.push('/tomorrow')} />
                      <Chip kind="assist" label="Let it go" onPress={() => setStep({ ...step, status: 'dismissed' }, 'Let go. That’s a fine choice too.')} />
                    </ChipRow>
                  </>
                ) : (
                  <Button variant="text" label="Update this step" onPress={() => setStepOpen(true)} />
                ))}
              {view === 'done' &&
                (step.outcome ? (
                  <Text variant="small" style={styles.stepAsk}>
                    {step.outcome === 'helped' ? 'You said it helped.' : 'You said it didn’t really help. That’s useful to know, not a failure.'}
                  </Text>
                ) : (
                  <>
                    <Text variant="small" style={styles.stepAsk}>
                      Did it help? Only if you want to say.
                    </Text>
                    <ChipRow>
                      <Chip kind="assist" label="It helped" onPress={() => setStep(setOutcome(step, 'helped'), 'Good to know.', false)} />
                      <Chip kind="assist" label="Not really" onPress={() => setStep(setOutcome(step, 'not-really'), 'Thanks for noticing. That’s useful information.', false)} />
                    </ChipRow>
                  </>
                ))}
              {view === 'upcoming' && <Button variant="text" label="Change or remove" onPress={() => router.push('/tomorrow')} />}
            </TrailStop>
          )}
          {earlier.map((e, i) => (
            <TrailStop
              key={e.id}
              blaze="painted"
              tint={tint.feeling(e.feelings[0]).mark}
              last={i === earlier.length - 1}
              onPress={() => router.push(`/entry/${e.id}`)}
              accessibilityLabel={`${relativeDay(e.date)}: ${e.title}. Open entry.`}>
              <Text variant="labelSmall">{relativeDay(e.date)}</Text>
              <Text variant="entryTitle">{e.title}</Text>
              <Feelings names={e.feelings} />
            </TrailStop>
          ))}
        </Trail>
        {entries.length === 0 && (
          <Text variant="small" style={styles.emptyNote}>
            Your trail starts with your first entry. There’s no pace to keep.
          </Text>
        )}
        <View style={styles.links}>
          <Button variant="text" label="See your whole journal" onPress={() => router.navigate('/journal')} />
          <Button variant="text" label="Look back across your entries" onPress={() => router.navigate('/patterns')} />
          {view === 'hidden' && <Button variant="text" label="Plan a small step for tomorrow" onPress={() => router.push('/tomorrow')} />}
        </View>
      </View>

      <Dialog
        visible={state.demo.sessionExpired || (sync?.status === 'signed-out' && !signInLater)}
        title="Please sign in again"
        body="Your session ended, so syncing is paused. Your draft and entries on this device are kept."
        confirmLabel="Sign in"
        cancelLabel="Later"
        onCancel={() => {
          setSignInLater(true);
          dispatch({ type: 'demo', patch: { sessionExpired: false } });
        }}
        onConfirm={() => {
          setSignInLater(true);
          dispatch({ type: 'demo', patch: { sessionExpired: false } });
          router.push('/account?mode=signin');
        }}
      />
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  banner: { marginBottom: space.md },
  bannerActions: { flexDirection: 'row', gap: space.xs },
  lede: { marginTop: space.xs },
  date: { marginTop: space.xxs },
  write: { marginTop: space.lg, marginBottom: space.xxs },
  section: { marginTop: space.lg },
  stepAsk: { marginTop: space.xxs },
  trailTitle: { marginBottom: space.xs },
  emptyNote: { marginTop: space.xs },
  links: { marginTop: space.xs },
}));
