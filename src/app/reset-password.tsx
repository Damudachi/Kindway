import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { Field } from '@/components/controls';
import { Notice, StateView } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useSession } from '@/state/session';
import { space } from '@/theme/tokens';

/** Where the password-reset link opens (kindway://reset-password?code=…). */
export default function ResetPassword() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { auth } = useSession();
  const [checked, setPhase] = useState<'checking' | 'choose' | 'done' | 'invalid'>('checking');
  const [linkMessage, setMessage] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const unusable = !auth || !code;
  const phase = unusable ? 'invalid' : checked;
  const message = unusable ? 'This link is incomplete or has expired.' : linkMessage;

  useEffect(() => {
    if (started.current || !auth || !code) return;
    started.current = true;
    void auth.exchangeCode(code).then((r) => {
      if (r.ok) setPhase('choose');
      else {
        setMessage(r.message);
        setPhase('invalid');
      }
    });
  }, [auth, code]);

  const save = async () => {
    if (busy || !auth) return;
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    setError(undefined);
    setBusy(true);
    const r = await auth.updatePassword(password);
    setBusy(false);
    if (r.ok) {
      setPassword('');
      setPhase('done');
    } else setError(r.message);
  };

  if (phase === 'checking')
    return (
      <Screen top={{ title: 'New password' }}>
        <StateView title="Checking your link…" body="This only takes a moment." />
      </Screen>
    );
  if (phase === 'invalid')
    return (
      <Screen top={{ title: 'New password' }}>
        <StateView title="This link can’t be used" body={message} action={<Button label="Request a new link" onPress={() => router.replace('/account?mode=signin')} />} />
      </Screen>
    );
  if (phase === 'done')
    return (
      <Screen top={{ title: 'New password' }}>
        <StateView title="Password changed" body="You’re signed in with your new password." action={<Button label="Continue" onPress={() => router.replace('/')} />} />
      </Screen>
    );

  return (
    <Screen top={{ title: 'New password' }} footer={<Button label="Save new password" loading={busy} onPress={() => void save()} />}>
      <Text variant="headline" accessibilityRole="header">
        Choose a new password.
      </Text>
      <Text variant="bodyMuted" style={styles.lede}>
        Your journal isn’t affected by changing your password.
      </Text>
      {error && <Notice tone="warn">{error}</Notice>}
      <Field label="New password" value={password} onChangeText={setPassword} helper="At least 8 characters." secureTextEntry autoComplete="new-password" onSubmitEditing={() => void save()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  lede: { marginTop: space.xs, marginBottom: space.lg },
});
