import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { CheckRow, Section } from '@/components/controls';
import { Dialog, useSnackbar } from '@/components/feedback';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { PROVIDER_COPY, SCOPE_COPY } from '@/data/ai-disclosure';
import { longDate } from '@/data/dates';
import { AI_SCOPES, latestConsent, type AiScope } from '@/services/ai/consent';
import { useAiConsent } from '@/state/ai-consent';
import { useStore } from '@/state/demo-store';
import { useRealAi } from '@/state/real-ai';
import { useSession } from '@/state/session';
import { space } from '@/theme/tokens';

const STATUS_TEXT = {
  none: 'Not allowed.',
  active: 'Allowed.',
  outdated: 'Not allowed. What’s described here changed since you agreed, so you’d need to agree again.',
  withdrawn: 'Not allowed. You withdrew it.',
} as const;

/** AI processing consent: three separate choices, recorded on the user's account. */
export default function AiConsent() {
  const session = useSession();
  const consent = useAiConsent();

  return (
    <Screen top={{ back: true, title: 'AI processing' }}>
      <Text variant="headline" accessibilityRole="header">
        Sending your writing to AI
      </Text>
      <Text variant="bodyMuted" style={styles.lede}>
        Three separate choices. Each one only allows a request you start yourself, and you can withdraw any of them at any time.
      </Text>

      {session.user && session.mode !== 'cloud-sync' && (
        <Notice title="AI also needs cloud backup on this device">
          Kindway’s server reads the entry from your account when you ask for AI, so AI works only when cloud backup is on here. Until then, nothing is sent to {PROVIDER_COPY.name}.
        </Notice>
      )}

      {consent.load === 'unavailable' ? (
        <Section title="An account is needed">
          <Text variant="body">
            Your choice is recorded on your account so Kindway’s server can check it before any request. Without an account, nothing can be sent to AI, and your journal works the same.
          </Text>
          {session.configured ? (
            <Button variant="secondary" label="Sign in or create an account" onPress={() => router.push('/account?mode=signin')} style={styles.gap} />
          ) : (
            <Text variant="small" style={styles.gapSm}>
              Accounts aren’t available in this build of the app.
            </Text>
          )}
        </Section>
      ) : consent.load === 'loading' ? (
        <Section title="Your choices">
          <Text variant="bodyMuted" accessibilityLiveRegion="polite">
            Checking your account…
          </Text>
        </Section>
      ) : consent.load === 'error' ? (
        <Section title="Your choices">
          <Notice tone="warn" title="Couldn’t check your choices">
            Kindway’s server couldn’t be reached. Until it can, nothing is sent to AI.
          </Notice>
          <Button variant="secondary" label="Try again" icon="refresh" onPress={consent.reload} style={styles.gap} />
        </Section>
      ) : (
        <>
          {AI_SCOPES.map((scope) => (
            <ScopeSection key={scope} scope={scope} />
          ))}
          <DeleteOutputsSection />
        </>
      )}

      <Section title="Who processes it">
        <Text variant="body">{PROVIDER_COPY.who}</Text>
        {PROVIDER_COPY.retention.map((line) => (
          <Text key={line} variant="small" style={styles.gapSm}>
            {line}
          </Text>
        ))}
        <Text variant="small" style={styles.gapSm}>
          {PROVIDER_COPY.separate}
        </Text>
        <Text variant="labelSmall" style={styles.gapSm}>
          {PROVIDER_COPY.checked}
        </Text>
      </Section>

      <Section title="What to keep in mind">
        {PROVIDER_COPY.limits.map((line) => (
          <Text key={line} variant="body" style={styles.gapSm}>
            {line}
          </Text>
        ))}
        <Button variant="text" label="Read privacy details" onPress={() => router.push('/settings/privacy')} />
      </Section>
    </Screen>
  );
}

function ScopeSection({ scope }: { scope: AiScope }) {
  const consent = useAiConsent();
  const snack = useSnackbar();
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const copy = SCOPE_COPY[scope];
  const status = consent.status(scope);
  const latest = latestConsent(consent.records, scope);

  const grant = async () => {
    setBusy(true);
    const ok = await consent.grant(scope);
    setBusy(false);
    setUnderstood(false);
    snack({ message: ok ? `${copy.title}: allowed. Recorded on your account.` : 'Couldn’t record that. Nothing changed; try again when you’re online.' });
  };

  const withdraw = async () => {
    setConfirmWithdraw(false);
    setBusy(true);
    const ok = await consent.revoke(scope);
    setBusy(false);
    snack({ message: ok ? `${copy.title}: withdrawn. Kindway’s server will refuse these requests.` : 'Couldn’t withdraw it. Try again when you’re online.' });
  };

  return (
    <Section title={copy.title}>
      <Text variant="body">{copy.when}</Text>
      <Text variant="label" style={styles.gap}>
        What would be sent
      </Text>
      {copy.sent.map((line) => (
        <Text key={line} variant="small" style={styles.bullet}>
          • {line}
        </Text>
      ))}
      <Text variant="label" style={styles.gapSm}>
        Never sent
      </Text>
      {copy.notSent.map((line) => (
        <Text key={line} variant="small" style={styles.bullet}>
          • {line}
        </Text>
      ))}

      <Text variant="body" style={styles.gap} accessibilityLiveRegion="polite">
        {STATUS_TEXT[status]}
        {status === 'active' && latest ? ` Since ${longDate(latest.acceptedAt)}.` : ''}
      </Text>

      {status === 'active' ? (
        <Button variant="secondary" label={`Withdraw: ${copy.title.toLowerCase()}`} disabled={busy} loading={busy} onPress={() => setConfirmWithdraw(true)} style={styles.gapSm} />
      ) : (
        <View style={styles.gapSm}>
          <CheckRow
            label={`I’ve read what would be sent, who processes it and how long ${PROVIDER_COPY.name} may keep it.`}
            checked={understood}
            onChange={setUnderstood}
          />
          <Button variant="secondary" label={`Allow: ${copy.title.toLowerCase()}`} disabled={!understood || busy} loading={busy} onPress={() => void grant()} />
        </View>
      )}

      <Dialog
        visible={confirmWithdraw}
        title="Withdraw this choice?"
        body={`Kindway’s server will refuse new ${copy.title.toLowerCase()} from now on. Your entries aren’t affected. AI reflections and reviews already written stay until you delete them with “Delete AI outputs”.`}
        confirmLabel="Withdraw"
        onCancel={() => setConfirmWithdraw(false)}
        onConfirm={() => void withdraw()}
      />
    </Section>
  );
}

/** Deletes every AI reflection and review, on the account and on this device. Entries stay. */
function DeleteOutputsSection() {
  const { state, dispatch } = useStore();
  const real = useRealAi();
  const snack = useSnackbar();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!real.outputs) return null;
  const outputs = real.outputs;

  const remove = async () => {
    setConfirm(false);
    setBusy(true);
    try {
      await outputs.deleteAll();
      for (const e of state.entries) if (e.reflection?.source === 'ai') dispatch({ type: 'removeReflection', id: e.id });
      dispatch({ type: 'removeAiChats' });
      snack({ message: 'AI reflections, reviews and follow-up conversations deleted. Your entries are unchanged.' });
    } catch {
      snack({ message: 'Couldn’t delete them. Nothing changed; try again when you’re online.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="AI outputs">
      <Text variant="body">
        AI reflections, reviews and follow-up conversations are kept on your account until you delete them, delete the entries they came from, or delete your account. Withdrawing a
        choice doesn’t delete them. Simulated replies stay on this device and aren’t affected.
      </Text>
      <Button variant="secondary" label="Delete AI outputs" disabled={busy} loading={busy} onPress={() => setConfirm(true)} style={styles.gap} />
      <Dialog
        visible={confirm}
        title="Delete all AI reflections, reviews and conversations?"
        body="They’ll be removed from your account and this device, including the messages you sent in AI follow-up conversations. Your entries, tags and compass stay as they are. This can’t be undone."
        confirmLabel="Delete"
        onCancel={() => setConfirm(false)}
        onConfirm={() => void remove()}
      />
    </Section>
  );
}

const styles = StyleSheet.create({
  lede: { marginTop: space.xs, marginBottom: space.md },
  gap: { marginTop: space.md },
  gapSm: { marginTop: space.xs },
  bullet: { marginTop: space.xxs },
});
