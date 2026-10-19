import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, IconButton } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { Dialog, useSnackbar } from '@/components/feedback';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { Trail, TrailStop } from '@/components/trail';
import { DEMO_NOW, daysAgo, longDate, partOfDay, relativeDay } from '@/data/dates';
import { HOME_PROMPTS } from '@/data/sample';
import type { TomorrowStep } from '@/data/types';
import { useEntries, useStore } from '@/state/demo-store';
import { space } from '@/theme/tokens';

const CHECK_INS: { id: TomorrowStep['status']; label: string; reply: string }[] = [
  { id: 'helped', label: 'It helped', reply: 'Good to know. Small steps count.' },
  { id: 'not-really', label: 'Not really', reply: "Thanks for noticing. That's useful information, not a failure." },
  { id: 'changed', label: 'I changed my mind', reply: 'Plans can change. Nothing is lost.' },
  { id: 'later', label: 'Ask me later', reply: "Okay, we'll leave it open." },
];

export default function Today() {
  const { state, dispatch } = useStore();
  const entries = useEntries();
  const snack = useSnackbar();
  const [focused, setFocused] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const when = partOfDay() === 'evening' ? 'tonight' : 'today';
  const prompt = HOME_PROMPTS[DEMO_NOW.getDate() % HOME_PROMPTS.length];
  const todays = entries.filter((e) => daysAgo(e.date) === 0);
  const earlier = entries.filter((e) => daysAgo(e.date) > 0).slice(0, 2);
  const step = state.tomorrow;
  const checkInDue = step && step.status === 'open' && daysAgo(step.savedOn) >= 1;
  const plannedTonight = step && step.status === 'open' && daysAgo(step.savedOn) === 0;
  // A theme from a weekly review the user asked for, unless they rejected or hid it.
  const thread =
    state.weeklyPatterns && state.weekly.status === 'ready'
      ? state.weekly.review.themes.find((t) => state.insightFeedback[t.id] !== 'not' && state.insightFeedback[t.id] !== 'hidden')
      : undefined;
  const hasDraft = state.draft.text.trim().length > 0 && !state.draft.editingId;

  const usePrompt = () => {
    if (!hasDraft) dispatch({ type: 'draft', patch: { text: `${prompt}\n\n` } });
    router.push('/write');
  };

  return (
    <Screen inTabs top={{ wordmark: true, actions: <IconButton icon="cog-outline" label="Settings" onPress={() => router.push('/settings')} /> }}>
      {state.demo.ai === 'offline' && (
        <View style={styles.banner}>
          <Notice tone="info" icon="wifi-off" title="You're offline">
            You can still write. Entries are kept on this device until you’re back online.
          </Notice>
        </View>
      )}

      <Text variant="display" accessibilityRole="header">
        How are you arriving {when}?
      </Text>
      <Text variant="bodyMuted" style={styles.lede}>
        Start anywhere. It doesn’t need to make sense yet.
      </Text>
      <Text variant="small" style={styles.date}>
        {longDate(DEMO_NOW.toISOString())}
      </Text>

      <Button
        label={hasDraft ? 'Continue your draft' : 'Write a thought'}
        trailingIcon="arrow-right"
        onPress={() => router.push('/write')}
        style={styles.write}
      />
      <ChipRow>
        <Chip kind="assist" icon="microphone-outline" label="Speak" onPress={() => router.push('/voice')} />
        <Chip kind="assist" icon="lightbulb-on-outline" label={`“${prompt}”`} onPress={usePrompt} />
      </ChipRow>

      <View style={styles.section}>
        <Text variant="title" accessibilityRole="header" style={styles.trailTitle}>
          Your trail
        </Text>
        <Trail>
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
                paint={focused && state.justPainted === e.id}
                onPainted={() => dispatch({ type: 'patch', patch: { justPainted: undefined } })}
                onPress={() => router.push(`/entry/${e.id}`)}
                accessibilityLabel={`Today: ${e.title}. Open entry.`}>
                <Text variant="labelSmall">Today</Text>
                <Text variant="entryTitle">{e.title}</Text>
              </TrailStop>
            ))
          )}
          {(checkInDue || plannedTonight) && step && (
            <TrailStop blaze="next" accessibilityLabel={`${checkInDue ? 'Yesterday' : 'Tomorrow'}, optional step: ${step.text}`}>
              <Text variant="labelSmall">{checkInDue ? 'Yesterday’s small step' : 'Tomorrow'} · optional</Text>
              <Text variant="entryTitle">{step.text}</Text>
              {checkInDue &&
                (checkingIn ? (
                  <>
                    <Text variant="small" style={styles.stepAsk}>
                      Did it help? There’s no wrong answer.
                    </Text>
                    <ChipRow>
                      {CHECK_INS.map((c) => (
                        <Chip
                          key={c.id}
                          kind="assist"
                          label={c.label}
                          onPress={() => {
                            dispatch({ type: 'patch', patch: { tomorrow: { ...step, status: c.id } } });
                            setCheckingIn(false);
                            snack({ message: c.reply });
                          }}
                        />
                      ))}
                    </ChipRow>
                  </>
                ) : (
                  <Button variant="text" label="Did it help?" onPress={() => setCheckingIn(true)} />
                ))}
              {plannedTonight && <Button variant="text" label="Change or remove" onPress={() => router.push('/tomorrow')} />}
            </TrailStop>
          )}
          {earlier.map((e, i) => (
            <TrailStop
              key={e.id}
              blaze="painted"
              last={i === earlier.length - 1}
              onPress={() => router.push(`/entry/${e.id}`)}
              accessibilityLabel={`${relativeDay(e.date)}: ${e.title}. Open entry.`}>
              <Text variant="labelSmall">{relativeDay(e.date)}</Text>
              <Text variant="entryTitle">{e.title}</Text>
              {thread && e.id === earlier.find((x) => thread.evidence.includes(x.id))?.id && (
                <Text variant="pencil" style={styles.thread}>
                  A thread you might be noticing: {thread.title.toLowerCase()}
                </Text>
              )}
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
          {!checkInDue && !plannedTonight && <Button variant="text" label="Plan a small step for tomorrow" onPress={() => router.push('/tomorrow')} />}
        </View>
      </View>

      <Dialog
        visible={state.demo.sessionExpired}
        title="Please sign in again"
        body="Your session ended, so syncing is paused. Your draft and entries on this device are kept."
        confirmLabel="Sign in"
        cancelLabel="Later"
        onCancel={() => dispatch({ type: 'demo', patch: { sessionExpired: false } })}
        onConfirm={() => {
          dispatch({ type: 'demo', patch: { sessionExpired: false } });
          router.push('/account?mode=signin');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: { marginBottom: space.md },
  lede: { marginTop: space.xs },
  date: { marginTop: space.xxs },
  write: { marginTop: space.lg, marginBottom: space.xxs },
  section: { marginTop: space.lg },
  stepAsk: { marginTop: space.xxs },
  trailTitle: { marginBottom: space.xs },
  thread: { marginTop: 2, fontSize: 14, lineHeight: 20 },
  emptyNote: { marginTop: space.xs },
  links: { marginTop: space.xs },
});
