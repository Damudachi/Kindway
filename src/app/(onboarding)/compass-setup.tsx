import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { Field } from '@/components/controls';
import { OnboardingProgress } from '@/components/onboarding-progress';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { COMPASS_AREAS } from '@/data/sample';
import { useStore } from '@/state/demo-store';
import { space } from '@/theme/tokens';

const MAX = 3;

export default function CompassSetup() {
  const { state, dispatch } = useStore();
  const [picked, setPicked] = useState<string[]>(state.compass.map((c) => c.area).slice(0, MAX));
  const [goal, setGoal] = useState('');

  const toggle = (area: string) =>
    setPicked((p) => (p.includes(area) ? p.filter((a) => a !== area) : p.length < MAX ? [...p, area] : p));

  const save = () => {
    dispatch({
      type: 'compass',
      compass: picked.map((area, i) => {
        const existing = state.compass.find((c) => c.area === area);
        const note = i === 0 && goal.trim() ? goal.trim() : (existing?.note ?? '');
        return { id: existing?.id ?? `c-${area}`, area, note, aiMayReference: existing?.aiMayReference ?? true };
      }),
    });
    router.push('/account');
  };

  return (
    <Screen
      top={{ back: true }}
      footer={
        <>
          <Button label="Continue" trailingIcon="arrow-right" onPress={save} />
          <Button
            variant="text"
            label="Skip for now"
            style={styles.center}
            onPress={() => {
              dispatch({ type: 'compass', compass: [] });
              router.push('/account');
            }}
          />
        </>
      }>
      <OnboardingProgress step={2} />
      <Text variant="headline" accessibilityRole="header" style={styles.title}>
        What matters to you in the long run?
      </Text>
      <Text variant="bodyMuted" style={styles.lede}>
        Pick up to three things you want to protect or grow. This is a compass, not a contract, and you can change it any time.
      </Text>
      <ChipRow>
        {COMPASS_AREAS.map((a) => (
          <Chip key={a} label={a} selected={picked.includes(a)} disabled={!picked.includes(a) && picked.length >= MAX} onPress={() => toggle(a)} />
        ))}
      </ChipRow>
      <Text variant="small" style={styles.count} accessibilityLiveRegion="polite">
        {picked.length} of {MAX} chosen
      </Text>
      <Field
        label="Anything specific you're working toward? (optional)"
        placeholder="For example: finish my portfolio this term"
        value={goal}
        onChangeText={setGoal}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: space.lg },
  lede: { marginTop: space.xs, marginBottom: space.md },
  count: { marginTop: space.xs, marginBottom: space.lg },
  center: { alignSelf: 'center' },
});
