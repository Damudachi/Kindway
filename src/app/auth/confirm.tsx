import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/button';
import { StateView } from '@/components/notice';
import { Screen } from '@/components/screen';
import { useSession } from '@/state/session';

/** Where the email-confirmation link opens (kindway://auth/confirm?code=…). */
export default function ConfirmEmail() {
  const { code, error_description } = useLocalSearchParams<{ code?: string; error_description?: string }>();
  const { auth } = useSession();
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const started = useRef(false);
  const unusable = !auth || !code ? { ok: false, message: error_description ? 'This link has expired or was already used.' : 'This link is incomplete.' } : null;

  useEffect(() => {
    if (started.current || !auth || !code) return;
    started.current = true;
    void auth.exchangeCode(code).then((r) => setResult(r.ok ? { ok: true } : { ok: false, message: r.message }));
  }, [auth, code]);

  const shown = unusable ?? result;
  return (
    <Screen top={{ title: 'Confirm email' }}>
      {!shown ? (
        <StateView title="Confirming…" body="This only takes a moment." />
      ) : shown.ok ? (
        <StateView
          title="Email confirmed"
          body="You’re signed in. Nothing has been uploaded; you can choose whether to back up your journal next."
          action={<Button label="Continue" onPress={() => router.replace('/sync')} />}
        />
      ) : (
        <StateView
          title="Couldn’t confirm here"
          body={`${shown.message} If you confirmed on another device, your email is still confirmed: just sign in.`}
          action={<Button label="Sign in" onPress={() => router.replace('/account?mode=signin')} />}
        />
      )}
    </Screen>
  );
}
