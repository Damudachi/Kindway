import { router } from 'expo-router';
import { useRef, useState } from 'react';

import { Button } from '@/components/button';
import { Field } from '@/components/controls';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useSession } from '@/state/session';
import { makeStyles } from '@/theme/theme';
import { space } from '@/theme/tokens';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Changing the email sends a link to the current and the new address; both must be opened. */
export default function ChangeEmail() {
  const styles = useStyles();
  const { auth, user } = useSession();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  // A ref, because a second press can arrive before the state above has re-rendered.
  const sending = useRef(false);

  const send = async () => {
    if (sending.current || !auth || !user) return;
    const address = email.trim();
    if (!EMAIL.test(address)) {
      setError('Enter an email address like name@example.com.');
      return;
    }
    if (address.toLowerCase() === user.email.toLowerCase()) {
      setError('That’s already your email address.');
      return;
    }
    setError(undefined);
    sending.current = true;
    setBusy(true);
    try {
      const result = await auth.changeEmail(address);
      if (result.ok) setSent(true);
      // Here the person is signed in already, so "try signing in instead" would point the wrong way.
      else setError(result.reference === 'email_exists' || result.reference === 'user_already_exists' ? 'Another account already uses this email address.' : result.message);
    } catch {
      setError('Something went wrong. Try again in a moment.');
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  if (sent)
    return (
      <Screen top={{ back: true, title: 'Change email' }} footer={<Button label="Done" onPress={() => router.back()} />}>
        <Text variant="headline" accessibilityRole="header">
          Check both inboxes.
        </Text>
        <Text variant="bodyMuted" style={styles.lede}>
          We sent a link to both your current and new address. Open both, then your new email is used to sign in.
        </Text>
        <Notice>The links can take a minute to arrive. Check spam if you don’t see them.</Notice>
      </Screen>
    );

  return (
    <Screen top={{ back: true, title: 'Change email' }} footer={<Button label="Send confirmation links" loading={busy} onPress={() => void send()} />}>
      <Text variant="headline" accessibilityRole="header">
        Use a different email.
      </Text>
      <Text variant="bodyMuted" style={styles.lede}>
        You’re signed in as {user?.email}. Your journal isn’t affected by changing your email.
      </Text>
      <Field
        label="New email address"
        value={email}
        onChangeText={setEmail}
        error={error}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        returnKeyType="send"
        onSubmitEditing={() => void send()}
      />
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  lede: { marginTop: space.xs, marginBottom: space.lg },
}));
