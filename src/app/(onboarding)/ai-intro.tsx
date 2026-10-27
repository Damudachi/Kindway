import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AiConsentDialog } from '@/components/ai-consent-dialog';
import { Button, type IconName } from '@/components/button';
import { useSnackbar } from '@/components/feedback';
import { Notice } from '@/components/notice';
import { OnboardingProgress } from '@/components/onboarding-progress';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { PROVIDER_COPY } from '@/data/ai-disclosure';
import type { AiScope } from '@/services/ai/consent';
import { useAiConsent } from '@/state/ai-consent';
import { useAiBlocker, useRealAi } from '@/state/real-ai';
import { makeStyles, useTheme } from '@/theme/theme';
import { space } from '@/theme/tokens';

const FEATURES: { scope: AiScope; icon: IconName; title: string; body: string; allow: string }[] = [
  {
    scope: 'entry_reflection',
    icon: 'creation-outline',
    title: 'A reflection on an entry',
    body: 'After you write, ask for a short reflection in the support style you picked. Only that entry is used.',
    allow: 'Allow AI reflections',
  },
  {
    scope: 'follow_up',
    icon: 'chat-processing-outline',
    title: 'Talk it through',
    body: 'Keep going with a few back-and-forth replies about one entry, when one reflection isn’t enough.',
    allow: 'Allow AI replies',
  },
  {
    scope: 'cross_entry_analysis',
    icon: 'map-search-outline',
    title: 'An AI review of your week',
    body: 'On Patterns, look across a week or 30 days for themes and strengths, each linked to the entries behind it.',
    allow: 'Allow AI reviews',
  },
];

/**
 * Introduces what the AI does before the first entry, and where it's allowed. With an account
 * and cloud backup each part can be allowed right here (each is its own consent); otherwise it
 * says previews are simulated and where real AI can be turned on later.
 */
export default function AiIntro() {
  const styles = useStyles();
  const real = useRealAi();

  return (
    <Screen top={{ back: true }} footer={<Button label="Continue" trailingIcon="arrow-right" onPress={() => router.push('/first-entry')} />}>
      <OnboardingProgress step={5} />
      <Text variant="pageTitle" accessibilityRole="header" style={styles.title}>
        What Kindway’s AI can do
      </Text>
      <Text variant="bodyMuted" style={styles.lede}>
        All of it is optional, runs only when you ask, and is always labelled. Your journal works fully without it.
      </Text>

      {FEATURES.map((f) => (
        <Feature key={f.scope} feature={f} offer={real.needs === null} />
      ))}

      <View style={styles.status}>
        {real.needs === null ? (
          <Text variant="small">
            Allowing one sends that writing to {PROVIDER_COPY.name}, and only when you ask. You can change any of these in Settings → AI processing.
          </Text>
        ) : (
          <Notice icon="creation-outline" title="For now: simulated previews">
            Until you sign in with cloud backup, reflections are simulated previews written on this device, and nothing is sent anywhere. Real AI can be turned on later in Settings → AI processing.
          </Notice>
        )}
      </View>
    </Screen>
  );
}

function Feature({ feature, offer }: { feature: (typeof FEATURES)[number]; offer: boolean }) {
  const styles = useStyles();
  const { color } = useTheme();
  const consent = useAiConsent();
  const blocker = useAiBlocker(feature.scope);
  const snack = useSnackbar();
  const [asking, setAsking] = useState(false);
  const allowed = consent.status(feature.scope) === 'active';

  return (
    <View style={styles.feature}>
      <View style={styles.badge}>
        <MaterialCommunityIcons name={feature.icon} size={22} color={color.onTrailContainer} />
      </View>
      <View style={styles.flex}>
        <Text variant="title">{feature.title}</Text>
        <Text variant="body">{feature.body}</Text>
        {offer &&
          (allowed ? (
            <View style={styles.allowed}>
              <MaterialCommunityIcons name="check" size={18} color={color.lichen} />
              <Text variant="label">Allowed</Text>
            </View>
          ) : (
            <Button variant="secondary" label={feature.allow} onPress={() => setAsking(true)} style={styles.allow} />
          ))}
      </View>
      <AiConsentDialog
        scope={feature.scope}
        blocker={asking && blocker && blocker !== 'consent-loading' ? blocker : null}
        onCancel={() => setAsking(false)}
        onAllowed={() => setAsking(false)}
        onGrantFailed={() => {
          setAsking(false);
          snack({ message: 'That couldn’t be saved, so it’s still off. You can try again in Settings.' });
        }}
      />
    </View>
  );
}

const useStyles = makeStyles((color) => ({
  title: { marginTop: space.lg },
  lede: { marginTop: space.xs, marginBottom: space.sm },
  feature: { flexDirection: 'row', gap: space.md, paddingVertical: space.md, borderTopWidth: 1, borderTopColor: color.sand },
  badge: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: color.trailContainer },
  flex: { flex: 1, gap: space.xxs },
  allowed: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, marginTop: space.xs },
  allow: { marginTop: space.xs, alignSelf: 'flex-start' },
  status: { marginTop: space.sm },
}));
