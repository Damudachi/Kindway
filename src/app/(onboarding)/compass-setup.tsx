import { router } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { Field } from '@/components/controls';
import { OnboardingProgress } from '@/components/onboarding-progress';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { COMPASS_AREAS, COMPASS_EXAMPLES } from '@/data/sample';
import { useStore } from '@/state/demo-store';
import { useSession } from '@/state/session';
import { makeStyles } from '@/theme/theme';
import { space } from '@/theme/tokens';

const MAX = 3;

export default function CompassSetup() {
  const styles = useStyles();
  const { state, dispatch } = useStore();
  const { user } = useSession();
  // Someone already signed in has an account; offering to create one again is what looped them.
  const next = user ? '/consent' : '/account';
  const [picked, setPicked] = useState<string[]>(state.compass.map((c) => c.area).slice(0, MAX));
  const [goals, setGoals] = useState<Record<string, string>>(Object.fromEntries(state.compass.map((c) => [c.area, c.note])));

  const toggle = (area: string) =>
    setPicked((p) => (p.includes(area) ? p.filter((a) => a !== area) : p.length < MAX ? [...p, area] : p));

  const save = () => {
    dispatch({
      type: 'compass',
      compass: picked.map((area) => {
        const existing = state.compass.find((c) => c.area === area);
        return { id: existing?.id ?? `c-${area}`, area, note: (goals[area] ?? '').trim(), aiMayReference: existing?.aiMayReference ?? true };
      }),
    });
    router.push(next);
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
              router.push(next);
            }}
          />
        </>
      }>
      <OnboardingProgress step={2} />
      <Text variant="pageTitle" accessibilityRole="header" style={styles.title}>
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
      {picked.map((area) => (
        <Field
          key={area}
          label={`${area}: anything you're working toward? (optional)`}
          placeholder={COMPASS_EXAMPLES[area]}
          value={goals[area] ?? ''}
          onChangeText={(t) => setGoals((g) => ({ ...g, [area]: t }))}
        />
      ))}
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  title: { marginTop: space.lg },
  lede: { marginTop: space.xs, marginBottom: space.md },
  count: { marginTop: space.xs, marginBottom: space.lg },
  center: { alignSelf: 'center' },
}));
