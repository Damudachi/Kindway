import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, type TextInputInstance } from 'react-native';

import { Button } from '@/components/button';
import { Field } from '@/components/controls';
import { Notice } from '@/components/notice';
import { OnboardingProgress } from '@/components/onboarding-progress';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useStore } from '@/state/demo-store';
import { space } from '@/theme/tokens';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** TODO(auth): wire to Supabase Auth. This screen validates locally and creates nothing. */
export default function Account() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<'signup' | 'signin'>(params.mode === 'signin' ? 'signin' : 'signup');
  const { state, dispatch } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInputInstance>(null);
  const signup = mode === 'signup';

  const submit = () => {
    const next: typeof errors = {};
    if (!EMAIL.test(email.trim())) next.email = 'Enter an email address like name@example.com.';
    if (signup && password.length < 8) next.password = 'Use at least 8 characters.';
    if (!signup && password.length === 0) next.password = 'Enter your password.';
    setErrors(next);
    if (next.email || next.password) return;
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      if (state.demo.signInError) {
        setErrors({
          form: signup
            ? "We couldn't create the account right now. Check your connection and try again."
            : "That email and password don't match. Check them and try again.",
        });
        return;
      }
      dispatch({ type: 'patch', patch: { account: { email: email.trim() } } });
      if (state.onboarded) router.back();
      else router.push(signup ? '/consent' : '/consent?next=today');
    }, 900);
  };

  return (
    <Screen
      top={{ back: true }}
      footer={
        <>
          <Button label={signup ? 'Create account' : 'Sign in'} loading={busy} onPress={submit} />
          <Button
            variant="text"
            style={styles.center}
            label={signup ? 'I already have an account' : 'I need a new account'}
            onPress={() => {
              setErrors({});
              setMode(signup ? 'signin' : 'signup');
            }}
          />
          {!state.onboarded && (
            <Button variant="text" style={styles.center} label="Continue without an account" onPress={() => router.push('/consent')} />
          )}
        </>
      }>
      {signup && <OnboardingProgress step={3} />}
      <Text variant="headline" accessibilityRole="header" style={styles.title}>
        {signup ? 'Keep your journal yours.' : 'Welcome back.'}
      </Text>
      <Text variant="bodyMuted" style={styles.lede}>
        {signup
          ? 'An account lets you keep entries safe and open them on your other devices. We only ask for what we need.'
          : 'Sign in to pick up where you left off.'}
      </Text>
      {errors.form && (
        <Notice tone="warn" title={signup ? 'Account not created' : 'Couldn’t sign in'}>
          {errors.form}
        </Notice>
      )}
      <Field
        label="Email address"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <Field
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        helper={signup ? 'At least 8 characters.' : undefined}
        secureTextEntry
        autoComplete={signup ? 'new-password' : 'current-password'}
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <Notice tone="demo" title="Demo only">
        No account is created and nothing leaves this device. Any email and password that pass the checks will continue, or you can skip this step.
      </Notice>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: space.lg },
  lede: { marginTop: space.xs, marginBottom: space.lg },
  center: { alignSelf: 'center' },
});
