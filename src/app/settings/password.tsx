import { router } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/button';
import { Field } from '@/components/controls';
import { useSnackbar } from '@/components/feedback';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useSession } from '@/state/session';
import { makeStyles } from '@/theme/theme';
import { space } from '@/theme/tokens';

/** Changing a password asks for the current one first, so a borrowed, unlocked phone can't change it. */
export default function ChangePassword() {
  const styles = useStyles();
  const { auth, user } = useSession();
  const snack = useSnackbar();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy || !auth || !user) return;
    if (next.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      const check = await auth.signIn(user.email, current);
      if (!check.ok) {
        setError(check.reference === 'invalid_credentials' ? 'That isn’t your current password.' : check.message);
        return;
      }
      const result = await auth.updatePassword(next);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      snack({ message: 'Password changed.' });
      router.back();
    } catch {
      // Never leave the button spinning: say it didn't work.
      setError('Something went wrong. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen top={{ back: true, title: 'Change password' }} footer={<Button label="Change password" loading={busy} onPress={() => void save()} />}>
      <Text variant="headline" accessibilityRole="header">
        Choose a new password.
      </Text>
      <Text variant="bodyMuted" style={styles.lede}>
        Your journal isn’t affected by changing your password.
      </Text>
      {error && <Notice tone="warn">{error}</Notice>}
      <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" />
      <Field label="New password" value={next} onChangeText={setNext} helper="At least 8 characters." secureTextEntry autoComplete="new-password" onSubmitEditing={() => void save()} />
      <Button variant="text" label="Forgot your current password?" onPress={() => router.push('/account?mode=forgot')} />
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  lede: { marginTop: space.xs, marginBottom: space.lg },
}));
