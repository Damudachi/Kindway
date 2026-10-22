import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Text } from '@/components/text';
import type { AiScope } from '@/services/ai/consent';
import { useAiConsent } from '@/state/ai-consent';
import { useAiBlocker, type AiBlocker } from '@/state/real-ai';
import { space } from '@/theme/tokens';

const WHAT: Record<AiScope, string> = {
  entry_reflection: 'AI reflections on an entry',
  follow_up: 'AI follow-up replies',
  cross_entry_analysis: 'AI reviews across entries',
};

const COPY: Record<AiBlocker, (what: string) => string> = {
  account: () => 'Real AI isn’t on: it needs a signed-in account with cloud backup.',
  'cloud-sync': () => 'Real AI isn’t on: it reads the copy in your account, so cloud backup needs to be on for this device.',
  'consent-loading': () => 'Checking whether you’ve allowed real AI…',
  'consent-error': () => 'Couldn’t check your AI consent, so real AI is off for now. Nothing was sent.',
  none: (what) => `Real AI isn’t on: you haven’t allowed ${what}.`,
  outdated: (what) => `Real AI is paused: the terms for ${what} changed since you agreed. Review them to turn it back on.`,
  withdrawn: (what) => `Real AI is off: you withdrew consent for ${what}.`,
};

/** Says why a simulated response was used instead of real AI, and offers the one fix. */
export function AiUnavailableNote({ scope }: { scope: AiScope }) {
  const blocker = useAiBlocker(scope);
  const consent = useAiConsent();
  if (!blocker) return null;
  const action =
    blocker === 'account'
      ? { label: 'Sign in', onPress: () => router.push('/account?mode=signin') }
      : blocker === 'cloud-sync'
        ? { label: 'Cloud backup', onPress: () => router.push('/sync') }
        : blocker === 'consent-error'
          ? { label: 'Try again', onPress: consent.reload }
          : blocker === 'consent-loading'
            ? null
            : { label: 'AI processing consent', onPress: () => router.push('/settings/ai-consent') };
  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <Text variant="small">{COPY[blocker](WHAT[scope])}</Text>
      {action && <Button variant="text" label={action.label} onPress={action.onPress} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xxs },
});
