import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { CheckRow } from '@/components/controls';
import { Dialog } from '@/components/feedback';
import { Text } from '@/components/text';
import { PROVIDER_COPY, SCOPE_COPY } from '@/data/ai-disclosure';
import { useAiConsent } from '@/state/ai-consent';
import type { AiBlocker } from '@/state/real-ai';
import { space } from '@/theme/tokens';

type Blocker = Exclude<AiBlocker, 'consent-loading'>;

const ASK: Record<'none' | 'outdated' | 'withdrawn', { title: string; body: string }> = {
  none: { title: 'Allow AI replies here?', body: `Talking an entry through uses real AI replies from ${PROVIDER_COPY.name}. Nothing is sent until you allow it.` },
  outdated: { title: 'Agree to the new terms?', body: `What’s sent for AI follow-up replies changed since you agreed. Nothing is sent to ${PROVIDER_COPY.name} until you agree again.` },
  withdrawn: { title: 'Allow AI replies again?', body: `You withdrew consent for AI follow-up replies. Nothing is sent to ${PROVIDER_COPY.name} unless you allow it again.` },
};

type Props = {
  /** Why real AI can't reply right now; null hides the dialog. */
  blocker: Blocker | null;
  onCancel: () => void;
  /** Called once follow-up consent is recorded on the account. */
  onAllowed: () => void;
  onGrantFailed: () => void;
};

/**
 * Asked before the first message in a follow-up conversation that can't get a real AI reply:
 * either for follow-up consent, or for the account or cloud backup that consent needs.
 */
export function FollowUpConsentDialog({ blocker, onCancel, onAllowed, onGrantFailed }: Props) {
  const consent = useAiConsent();
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const copy = SCOPE_COPY.follow_up;

  const close = () => {
    setUnderstood(false);
    onCancel();
  };
  const go = (path: '/account?mode=signin' | '/sync') => {
    close();
    router.push(path);
  };

  if (blocker === 'account' || blocker === 'cloud-sync' || blocker === 'consent-error') {
    const setup = {
      account: {
        title: 'Sign in to talk this through',
        body: 'Replies here come from real AI, which needs a signed-in account with cloud backup so your choice can be recorded. Nothing was sent.',
        confirmLabel: 'Sign in',
        onConfirm: () => go('/account?mode=signin'),
      },
      'cloud-sync': {
        title: 'Turn on cloud backup first',
        body: 'Replies here come from real AI. Kindway’s server reads the entry from your account, so cloud backup needs to be on for this device. Nothing was sent.',
        confirmLabel: 'Cloud backup',
        onConfirm: () => go('/sync'),
      },
      'consent-error': {
        title: 'Couldn’t check your AI choices',
        body: 'Kindway’s server couldn’t be reached, so nothing was sent. Your message is still here.',
        confirmLabel: 'Try again',
        onConfirm: () => {
          close();
          consent.reload();
        },
      },
    }[blocker];
    return <Dialog visible {...setup} onCancel={close} />;
  }

  const allow = async () => {
    setBusy(true);
    const ok = await consent.grant('follow_up');
    setBusy(false);
    setUnderstood(false);
    if (ok) onAllowed();
    else onGrantFailed();
  };

  const ask = blocker ? ASK[blocker] : ASK.none;
  return (
    <Dialog
      visible={blocker !== null}
      title={ask.title}
      body={ask.body}
      confirmLabel="Allow and send"
      confirmDisabled={!understood}
      confirmLoading={busy}
      onCancel={close}
      onConfirm={() => void allow()}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text variant="label">What would be sent with each message</Text>
        {copy.sent.map((line) => (
          <Text key={line} variant="small">
            • {line}
          </Text>
        ))}
        <Text variant="label" style={styles.gap}>
          Never sent
        </Text>
        {copy.notSent.map((line) => (
          <Text key={line} variant="small">
            • {line}
          </Text>
        ))}
        <Text variant="small" style={styles.gap}>
          {PROVIDER_COPY.who}
        </Text>
        {PROVIDER_COPY.retention.map((line) => (
          <Text key={line} variant="small">
            {line}
          </Text>
        ))}
      </ScrollView>
      <CheckRow label={`I’ve read what would be sent, who processes it and how long ${PROVIDER_COPY.name} may keep it.`} checked={understood} onChange={setUnderstood} />
    </Dialog>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 240 },
  content: { gap: space.xxs },
  gap: { marginTop: space.xs },
});
