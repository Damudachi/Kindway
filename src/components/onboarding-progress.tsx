import { View } from 'react-native';

import { Text } from '@/components/text';
import { makeStyles } from '@/theme/theme';
import { space } from '@/theme/tokens';

const TOTAL = 5;

/** Linear progress for onboarding, drawn as a short stretch of trail. */
export function OnboardingProgress({ step }: { step: number }) {
  const styles = useStyles();
  return (
    <View
      style={styles.wrap}
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step} of ${TOTAL}`}
      accessibilityValue={{ min: 0, max: TOTAL, now: step }}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${(step / TOTAL) * 100}%` }]} />
      </View>
      <Text variant="labelSmall" importantForAccessibility="no">
        {step} of {TOTAL}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((color) => ({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  track: { flex: 1, height: 4, borderRadius: 2, backgroundColor: color.sand, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: color.trail },
}));
