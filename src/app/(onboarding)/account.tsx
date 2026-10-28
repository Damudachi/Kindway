import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { type TextInputInstance } from 'react-native';

import { Button } from '@/components/button';
import { Field } from '@/components/controls';
import { Notice } from '@/components/notice';
import { OnboardingProgress } from '@/components/onboarding-progress';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { appTarget, redirectTo } from '@/services/auth';
import { useSync } from '@/state/cloud-sync';
import { useStore } from '@/state/demo-store';
import { useSession } from '@/state/session';
import { makeStyles } from '@/theme/theme';
import { space } from '@/theme/tokens';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Mode = 'signup' | 'signin' | 'forgot';

/** Email/password sign-up, sign-in and password reset. An account is always optional. */
/** Where a confirmation link goes: the app, or the landing page and then the app. */
function linkRoute() {
  const [page] = redirectTo('auth/confirm').split('?');
  const target = appTarget('auth/confirm');
  return page === target ? target : `${page}, then ${target}`;
}

export default function Account() {
  const styles = useStyles();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'signin' || params.mode === 'forgot' ? params.mode : 'signup');
  const { state } = useStore();
  const { auth, user } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const sync = useSync();
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string; reference?: string }>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<'confirm' | 'reset' | null>(null);
  const passwordRef = useRef<TextInputInstance>(null);
  const signup = mode === 'signup';
  const forgot = mode === 'forgot';

  const switchTo = (next: Mode) => {
    setErrors({});
    setSent(null);
    setMode(next);
  };

  const continueOnboarding = () => {
    if (state.onboarded) router.back();
    else router.push(params.mode === 'signin' ? '/consent?next=today' : '/consent');
  };

  const submit = async () => {
    if (busy || !auth) return;
    const address = email.trim();
    const next: typeof errors = {};
    if (!EMAIL.test(address)) next.email = 'Enter an email address like name@example.com.';
    if (signup && password.length < 8) next.password = 'Use at least 8 characters.';
    if (mode === 'signin' && password.length === 0) next.password = 'Enter your password.';
    setErrors(next);
    if (next.email || next.password) return;
    setBusy(true);
    try {
      if (forgot) {
        const result = await auth.requestPasswordReset(address);
        if (result.ok) setSent('reset');
        else setErrors({ form: result.message, reference: result.reference });
        return;
      }
      const result = signup ? await auth.signUp(address, password) : await auth.signIn(address, password);
      if (!result.ok) {
        setErrors({ form: result.message, reference: result.reference });
        return;
      }
      setPassword('');
      if ('needsConfirmation' in result) {
        setSent('confirm');
        return;
      }
      // Signing in again as the account already syncing here doesn't restart its sync by itself.
      // Another account gets its own journal and sync instead, so the old one is left alone.
      if (sync?.status === 'signed-out' && user?.email.toLowerCase() === address.toLowerCase()) sync.retry();
      // Signing in never uploads anything by itself; the next screen asks first.
      if (!signup || state.onboarded) router.replace('/sync');
      else continueOnboarding();
    } catch {
      // Never leave the person with a spinner that just stops: say it didn't work.
      setErrors({ form: 'Something went wrong. Try again in a moment.', reference: 'unexpected' });
    } finally {
      setBusy(false);
    }
  };

  if (sent)
    return (
      <Screen
        top={{ back: true }}
        footer={
          <>
            <Button label="Go back to sign in" onPress={() => switchTo('signin')} />
            {sent === 'confirm' && !state.onboarded && <Button variant="text" style={styles.center} label="Use without an account instead" onPress={continueOnboarding} />}
          </>
        }>
        <Text variant="pageTitle" accessibilityRole="header" style={styles.title}>
          Check your email.
        </Text>
        <Text variant="bodyMuted" style={styles.lede}>
          {sent === 'confirm'
            ? `We sent a link to ${email.trim()}. Open it on this phone to confirm your account, then sign in. Until then, your journal stays on this device only.`
            : `If an account exists for ${email.trim()}, we sent a link to choose a new password. Open it on this phone.`}
        </Text>
        <Notice>The link can take a minute to arrive. Check spam if you don’t see it.</Notice>
        {__DEV__ && sent === 'confirm' && (
          // Development only: a fresh email's redirect_to matches this; an old one won't.
          <Text variant="small" style={styles.lede}>
            Development build: this link should return to {linkRoute()}
          </Text>
        )}
      </Screen>
    );

  return (
    <Screen
      top={{ back: true }}
      footer={
        <>
          <Button
            label={forgot ? 'Send reset link' : signup ? 'Create account' : 'Sign in'}
            loading={busy}
            disabled={!auth}
            onPress={() => void submit()}
          />
          {forgot ? (
            <Button variant="text" style={styles.center} label="Back to sign in" onPress={() => switchTo('signin')} />
          ) : (
            <Button
              variant="text"
              style={styles.center}
              label={signup ? 'I already have an account' : 'I need a new account'}
              onPress={() => switchTo(signup ? 'signin' : 'signup')}
            />
          )}
          {!state.onboarded && (
            <Button variant="text" style={styles.center} label="Continue without an account" onPress={() => router.push(params.mode === 'signin' ? '/consent?next=today' : '/consent')} />
          )}
        </>
      }>
      {signup && !state.onboarded && <OnboardingProgress step={3} />}
      <Text variant="pageTitle" accessibilityRole="header" style={styles.title}>
        {forgot ? 'Choose a new password.' : signup ? 'Keep your journal yours.' : 'Welcome back.'}
      </Text>
      <Text variant="bodyMuted" style={styles.lede}>
        {forgot
          ? 'Enter your account’s email and we’ll send a link to set a new password.'
          : signup
            ? 'An account can keep a private copy of your journal in the cloud, so you can open it on another device. Creating one doesn’t upload anything; you choose that separately.'
            : 'Sign in to pick up where you left off. Nothing from this device is uploaded until you choose to.'}
      </Text>
      {user && !forgot && <Notice>You’re signed in as {user.email}.</Notice>}
      {!auth && (
        <Notice tone="demo" title="Accounts aren’t set up in this build">
          This copy of the app isn’t connected to a Kindway server, so accounts can’t be created. Your journal works fully on this device.
        </Notice>
      )}
      {errors.form && (
        <Notice tone="warn" title={forgot ? 'Link not sent' : signup ? 'Account not created' : 'Couldn’t sign in'}>
          {errors.form}
          {errors.reference ? ` (Reference: ${errors.reference})` : ''}
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
        returnKeyType={forgot ? 'send' : 'next'}
        onSubmitEditing={() => (forgot ? void submit() : passwordRef.current?.focus())}
      />
      {!forgot && (
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
          onSubmitEditing={() => void submit()}
        />
      )}
      {mode === 'signin' && <Button variant="text" label="Forgot your password?" onPress={() => switchTo('forgot')} />}
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  title: { marginTop: space.lg },
  lede: { marginTop: space.xs, marginBottom: space.lg },
  center: { alignSelf: 'center' },
}));
