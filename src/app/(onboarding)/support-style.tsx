import { router } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/button';
import { RadioRow, SwitchRow } from '@/components/controls';
import { OnboardingProgress } from '@/components/onboarding-progress';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { SUPPORT_STYLES } from '@/data/sample';
import { useStore } from '@/state/demo-store';
import { makeStyles } from '@/theme/theme';
import { space } from '@/theme/tokens';

export default function SupportStyle() {
  const styles = useStyles();
  const { state, dispatch } = useStore();
  return (
    <Screen
      top={{ back: true }}
      footer={
        <>
          <Button label="Continue" trailingIcon="arrow-right" onPress={() => router.push('/compass-setup')} />
          <Button
            variant="text"
            label="I'll decide each time"
            style={styles.center}
            onPress={() => {
              dispatch({ type: 'patch', patch: { supportStyle: 'ask' } });
              router.push('/compass-setup');
            }}
          />
        </>
      }>
      <OnboardingProgress step={1} />
      <Text variant="headline" accessibilityRole="header" style={styles.title}>
        What kind of support helps you?
      </Text>
      <Text variant="bodyMuted" style={styles.lede}>
        Different days call for different things. Pick a starting point; you can change it for any entry.
      </Text>
      <View accessibilityRole="radiogroup">
        {SUPPORT_STYLES.map((s) => (
          <RadioRow
            key={s.id}
            title={s.title}
            detail={s.detail}
            selected={state.supportStyle === s.id}
            onPress={() => dispatch({ type: 'patch', patch: { supportStyle: s.id } })}
          />
        ))}
      </View>
      <SwitchRow
        title="Challenge me gently"
        detail="Kindway may question an assumption, kindly. It never shames or overrules you."
        value={state.challengeGently}
        onChange={(challengeGently) => dispatch({ type: 'patch', patch: { challengeGently } })}
      />
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  title: { marginTop: space.lg },
  lede: { marginTop: space.xs, marginBottom: space.lg },
  center: { alignSelf: 'center' },
}));
