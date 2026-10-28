import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { OnboardingProgress } from '@/components/onboarding-progress';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { onWeb } from '@/services/platform';
import { EVENING_TEXT, TIMES } from '@/services/reminders';
import { useStore } from '@/state/demo-store';
import { useAllowReminders } from '@/state/reminders';
import { makeStyles } from '@/theme/theme';
import { radius, space } from '@/theme/tokens';

/**
 * Optional evening reminder, the last onboarding step: offered after the first entry, once
 * there's something to come back to. Android's permission prompt comes only after "Remind me",
 * and skipping asks nothing. Either way Today comes next, and on the web, which has no
 * reminders yet, straight away.
 */
export default function RemindersSetup() {
  return onWeb() ? <Redirect href="/today" /> : <RemindersStep />;
}

function RemindersStep() {
  const styles = useStyles();
  const { state, dispatch } = useStore();
  const allow = useAllowReminders();
  const [busy, setBusy] = useState(false);
  const time = state.reminders.time;

  const remind = async () => {
    if (busy) return;
    setBusy(true);
    dispatch({ type: 'reminders', patch: { offered: true } });
    await allow({ enabled: true });
    setBusy(false);
    router.replace('/today');
  };

  return (
    <Screen
      top={{}}
      footer={
        <>
          <Button label="Remind me" icon="bell-outline" loading={busy} onPress={() => void remind()} />
          <Button variant="text" label="No reminders" style={styles.center} onPress={() => {
              dispatch({ type: 'reminders', patch: { offered: true } });
              router.replace('/today');
            }}
          />
        </>
      }>
      <OnboardingProgress step={6} />
      <Text variant="pageTitle" accessibilityRole="header" style={styles.title}>
        Would a gentle nudge help?
      </Text>
      <Text variant="bodyMuted" style={styles.lede}>
        One quiet reminder in the evening, with no sound and nothing from your entries. Skipping a day is always fine, and Kindway never counts.
      </Text>
      <Text variant="label" style={styles.label}>
        When
      </Text>
      <ChipRow>
        {TIMES.map((t) => (
          <Chip key={t} label={t} selected={time === t} onPress={() => dispatch({ type: 'reminders', patch: { time: t } })} />
        ))}
      </ChipRow>
      <View style={styles.preview} accessibilityLabel={`Notification preview: Kindway. ${EVENING_TEXT}`}>
        <Text variant="labelSmall">Kindway · {time}</Text>
        <Text variant="body">{EVENING_TEXT}</Text>
      </View>
      <Text variant="small">Days, a weekly look-back and pausing are in Settings → Gentle reminders.</Text>
    </Screen>
  );
}

const useStyles = makeStyles((color) => ({
  title: { marginTop: space.lg },
  lede: { marginTop: space.xs, marginBottom: space.md },
  label: { marginTop: space.sm },
  preview: { marginVertical: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: color.raised, borderWidth: 1, borderColor: color.sand, gap: 2 },
  center: { alignSelf: 'center' },
}));
