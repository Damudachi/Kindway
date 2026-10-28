import { useLinkingURL } from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/button';
import { Field } from '@/components/controls';
import { Notice, StateView } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { parseAuthCallback } from '@/services/auth';
import { onWeb } from '@/services/platform';
import { useSession } from '@/state/session';
import { makeStyles } from '@/theme/theme';
import { space } from '@/theme/tokens';

/**
 * Where the password-reset link opens: kindway:///reset-password?code=…, exp://…/--/reset-password
 * in Expo Go, or https://<site>/reset-password in the web app. On iPhone, a link asked for in the
 * Home Screen app opens in Safari, which can't use it; asked for again from Safari, it works.
 */
export default function ResetPassword() {
  const styles = useStyles();
  const params = useLocalSearchParams<{ code?: string; error_code?: string; error_description?: string; error?: string }>();
  const linked = useLinkingURL();
  const callback = parseAuthCallback(linked?.includes('reset-password') ? linked : null, params);
  const code = callback.kind === 'code' ? callback.code : null;
  const { auth } = useSession();
  const [checked, setPhase] = useState<'checking' | 'choose' | 'done' | 'invalid'>('checking');
  const [linkMessage, setMessage] = useState('');
  const [elsewhere, setElsewhere] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const unusable = !auth || !code;
  const phase = unusable ? 'invalid' : checked;
  const message = unusable ? (callback.kind === 'error' ? callback.message : 'This link is incomplete or has expired.') : linkMessage;

  useEffect(() => {
    if (started.current || !auth || !code) return;
    started.current = true;
    void auth.exchangeCode(code).then((r) => {
      if (r.ok) setPhase('choose');
      else {
        setMessage(r.message);
        setElsewhere(r.reference === 'pkce_verifier_missing');
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
  if (phase === 'invalid' && elsewhere && onWeb())
    return (
      <Screen top={{ title: 'New password' }}>
        <StateView
          title="Request the link again here"
          body="This link was asked for in Kindway on your Home Screen, which keeps its sign-in apart from Safari. Request a new link on this page, open it from your email, and choose your new password here. It then works in the app too."
          action={<Button label="Request a new link" onPress={() => router.replace('/account?mode=forgot')} />}
        />
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
        <StateView title="Password changed" body={`You’re signed in with your new password.${onWeb() ? ' Use it to sign in to Kindway on your Home Screen too.' : ''}`} action={<Button label="Continue" onPress={() => router.replace('/')} />} />
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

const useStyles = makeStyles(() => ({
  lede: { marginTop: space.xs, marginBottom: space.lg },
}));
