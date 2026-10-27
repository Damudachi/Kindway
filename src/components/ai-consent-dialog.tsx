import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from 'react-native';

import { CheckRow } from '@/components/controls';
import { Dialog } from '@/components/feedback';
import { Text } from '@/components/text';
import { PROVIDER_COPY, SCOPE_COPY } from '@/data/ai-disclosure';
import type { AiScope } from '@/services/ai/consent';
import { useAiConsent } from '@/state/ai-consent';
import type { AiBlocker } from '@/state/real-ai';
import { makeStyles } from '@/theme/theme';
import { space } from '@/theme/tokens';

export type ConsentBlocker = Exclude<AiBlocker, 'consent-loading'>;
type Ask = { title: string; body: string };

const P = PROVIDER_COPY.name;

/** Per scope: how to ask, by consent status, and what the setup dialogs call the feature. */
const COPY: Record<AiScope, { confirm: string; sentLabel: string; kept?: string; ask: Record<'none' | 'outdated' | 'withdrawn', Ask>; account: Ask; cloud: Ask }> = {
  follow_up: {
    confirm: 'Allow and send',
    sentLabel: 'What would be sent with each message',
    kept: ' Your message is still here.',
    ask: {
      none: { title: 'Allow AI replies here?', body: `Talking an entry through uses real AI replies from ${P}. Nothing is sent until you allow it.` },
      outdated: { title: 'Agree to the new terms?', body: `What’s sent for AI follow-up replies changed since you agreed. Nothing is sent to ${P} until you agree again.` },
      withdrawn: { title: 'Allow AI replies again?', body: `You withdrew consent for AI follow-up replies. Nothing is sent to ${P} unless you allow it again.` },
    },
    account: { title: 'Sign in to talk this through', body: 'Replies here come from real AI, which needs a signed-in account with cloud backup so your choice can be recorded. Nothing was sent.' },
    cloud: { title: 'Turn on cloud backup first', body: 'Replies here come from real AI. Kindway’s server reads the entry from your account, so cloud backup needs to be on for this device. Nothing was sent.' },
  },
  cross_entry_analysis: {
    confirm: 'Allow AI reviews',
    sentLabel: 'What would be sent with each review',
    ask: {
      none: { title: 'Allow AI reviews?', body: `A review sends the entries of the period you pick to ${P}, only when you ask for one. Nothing is sent until you allow it.` },
      outdated: { title: 'Agree to the new terms?', body: `What’s sent for AI reviews changed since you agreed. Nothing is sent to ${P} until you agree again.` },
      withdrawn: { title: 'Allow AI reviews again?', body: `You withdrew consent for AI reviews. Nothing is sent to ${P} unless you allow it again.` },
    },
    account: { title: 'Sign in for AI reviews', body: 'AI reviews need a signed-in account with cloud backup, so your choice can be recorded. Nothing was sent.' },
    cloud: { title: 'Turn on cloud backup first', body: 'AI reviews read the copies of your entries in your account, so cloud backup needs to be on for this device. Nothing was sent.' },
  },
  entry_reflection: {
    confirm: 'Allow AI reflections',
    sentLabel: 'What would be sent with each reflection',
    ask: {
      none: { title: 'Allow AI reflections?', body: `A reflection sends the one entry you ask about to ${P}, only when you ask. Nothing is sent until you allow it.` },
      outdated: { title: 'Agree to the new terms?', body: `What’s sent for AI reflections changed since you agreed. Nothing is sent to ${P} until you agree again.` },
      withdrawn: { title: 'Allow AI reflections again?', body: `You withdrew consent for AI reflections. Nothing is sent to ${P} unless you allow it again.` },
    },
    account: { title: 'Sign in for AI reflections', body: 'AI reflections need a signed-in account with cloud backup, so your choice can be recorded. Nothing was sent.' },
    cloud: { title: 'Turn on cloud backup first', body: 'Kindway’s server reads the entry from your account, so cloud backup needs to be on for this device. Nothing was sent.' },
  },
};

type Props = {
  scope: AiScope;
  /** Why real AI can't run for this scope right now; null hides the dialog. */
  blocker: ConsentBlocker | null;
  onCancel: () => void;
  /** Called once consent is recorded on the account. */
  onAllowed: () => void;
  onGrantFailed: () => void;
};

/**
 * Asks, right where the feature is, for one scope's consent: or for the account or cloud backup
 * that consent needs first. Shows exactly what would be sent and who processes it, and records
 * nothing until the user ticks that they've read it.
 */
export function AiConsentDialog({ scope, blocker, onCancel, onAllowed, onGrantFailed }: Props) {
  const styles = useStyles();
  const consent = useAiConsent();
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const copy = COPY[scope];
  const sent = SCOPE_COPY[scope];

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
      account: { ...copy.account, confirmLabel: 'Sign in', onConfirm: () => go('/account?mode=signin') },
      'cloud-sync': { ...copy.cloud, confirmLabel: 'Cloud backup', onConfirm: () => go('/sync') },
      'consent-error': {
        title: 'Couldn’t check your AI choices',
        body: `Kindway’s server couldn’t be reached, so nothing was sent.${copy.kept ?? ''}`,
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
    const ok = await consent.grant(scope);
    setBusy(false);
    setUnderstood(false);
    if (ok) onAllowed();
    else onGrantFailed();
  };

  const ask = blocker ? copy.ask[blocker] : copy.ask.none;
  return (
    <Dialog
      visible={blocker !== null}
      title={ask.title}
      body={ask.body}
      confirmLabel={copy.confirm}
      confirmDisabled={!understood}
      confirmLoading={busy}
      onCancel={close}
      onConfirm={() => void allow()}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text variant="label">{copy.sentLabel}</Text>
        {sent.sent.map((line) => (
          <Text key={line} variant="small">
            • {line}
          </Text>
        ))}
        <Text variant="label" style={styles.gap}>
          Never sent
        </Text>
        {sent.notSent.map((line) => (
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
      <CheckRow label={`I’ve read what would be sent, who processes it and how long ${P} may keep it.`} checked={understood} onChange={setUnderstood} />
    </Dialog>
  );
}

const useStyles = makeStyles(() => ({
  scroll: { maxHeight: 240 },
  content: { gap: space.xxs },
  gap: { marginTop: space.xs },
}));
