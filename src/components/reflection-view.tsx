import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

import { Button } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { useSnackbar } from '@/components/feedback';
import { Notice } from '@/components/notice';
import { Text } from '@/components/text';
import { STYLE_LABEL } from '@/data/sample';
import type { Entry } from '@/data/types';
import { useRequestReflection } from '@/state/actions';
import { useStore } from '@/state/demo-store';
import { color, radius, space } from '@/theme/tokens';

type Props = { entry: Entry; onRest: () => void };

/** The AI layer of an entry, kept visibly separate from the user's own words. */
export function ReflectionView({ entry, onRest }: Props) {
  const { state } = useStore();
  const request = useRequestReflection();
  const snack = useSnackbar();
  const reduce = useReducedMotion();
  const [feedback, setFeedback] = useState<string | null>(null);
  const r = entry.reflection;

  if (entry.reflectionStatus === 'loading') {
    return (
      <View style={styles.wrap} accessibilityLiveRegion="polite" accessibilityLabel="Reflecting on your entry">
        <Text variant="label">Reflecting on your entry…</Text>
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
      failed: { title: "The reflection didn't come through", body: 'Your entry is saved. The reflection service had a problem; you can try again now or later.' },
      rate: { title: 'Reflections are paused for a little while', body: "You've reached the reflection limit for now. Your entry is saved, and you can reflect on it later." },
      offline: { title: "You're offline", body: 'Your entry is kept on this device. Reflections need a connection, so try again once you are back online.' },
    }[entry.reflectionStatus];
    return (
      <View style={styles.wrap}>
        <Notice tone="warn" title={copy.title}>
          {copy.body}
        </Notice>
        <View style={styles.row}>
          {entry.reflectionStatus !== 'rate' && <Button variant="secondary" label="Try again" icon="refresh" onPress={() => request(entry)} />}
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
          <Text variant="bodyMuted">AI reflections are off. Turn them on in AI & memory if you want them.</Text>
        )}
      </View>
    );
  }

  const edited = r.basedOn !== entry.body;
  // Interpretations stay in pencil until the user says they fit.
  const inked = feedback === 'Helpful';
  const usedCompass = r.longGame && state.contextScope !== 'current';

  return (
    <Animated.View entering={reduce ? undefined : FadeIn.duration(360)} style={styles.wrap}>
      <Notice tone="demo" title="Example reflection">
        AI isn’t connected in this demo. This text is pre-written to show how a reflection would read.
      </Notice>

      {edited && (
        <Notice title="Based on an earlier version">
          You edited this entry after the reflection was written.
        </Notice>
      )}

      <Text variant="entry">{r.acknowledge}</Text>

      <View style={styles.part}>
        <Text variant="title" accessibilityRole="header">What happened, and what you concluded</Text>
        <Text variant={inked ? 'body' : 'pencil'}>{r.clarify}</Text>
      </View>

      <View style={styles.part}>
        <Text variant="title" accessibilityRole="header">Another way to see it</Text>
        <Text variant={inked ? 'body' : 'pencil'}>{r.perspective}</Text>
      </View>

      {usedCompass && r.longGame && (
        <View style={styles.compass}>
          <Text variant="labelSmall" style={{ color: color.onTrailContainer }}>
            From your compass: {r.longGame.value}
          </Text>
          <Text variant="body" style={{ color: color.onTrailContainer }}>
            {r.longGame.text}
          </Text>
        </View>
      )}

      <Text variant="pencil" style={styles.question}>
        {r.question}
      </Text>

      <Text variant="small">
        Reflected as “{STYLE_LABEL[r.style]}”. Used: this entry{usedCompass ? ' and one compass value' : ''}. Past entries: not used.
      </Text>

      <View style={styles.choices}>
        <Button label="Talk this through" trailingIcon="arrow-right" onPress={() => router.push(`/entry/${entry.id}/talk`)} />
        <Button variant="secondary" label="Plan one small step for tomorrow" onPress={() => router.push(`/tomorrow?from=${entry.id}`)} />
        <Button variant="text" label="Let this sit for tonight" onPress={onRest} />
      </View>

      <View style={styles.part}>
        <Text variant="label">Did this fit?</Text>
        <ChipRow>
          {['Helpful', 'Not quite', 'That’s not right'].map((f) => (
            <Chip
              key={f}
              label={f}
              selected={feedback === f}
              onPress={() => {
                setFeedback(f);
                snack({ message: 'Thanks. In the full app, this would shape future reflections.' });
              }}
            />
          ))}
        </ChipRow>
        <View style={styles.row}>
          <Button variant="text" label="Adjust how Kindway reflects" onPress={() => router.push('/settings/ai-memory')} />
        </View>
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
  compass: { backgroundColor: color.trailContainer, borderRadius: radius.md, padding: space.md, gap: space.xxs },
  question: { fontSize: 18, lineHeight: 28 },
  choices: { gap: space.xs, marginTop: space.xs },
  link: { color: color.trail, textDecorationLine: 'underline' },
  skeletonGroup: { gap: space.xs },
  skeleton: { height: 14, borderRadius: 7, backgroundColor: color.sunk },
});
