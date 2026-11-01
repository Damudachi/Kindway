import { useLinkingURL } from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/button';
import { StateView } from '@/components/notice';
import { Screen } from '@/components/screen';
import { parseAuthCallback } from '@/services/auth';
import { onWeb } from '@/services/platform';
import { useSession } from '@/state/session';

/**
 * Where the email-confirmation link opens: kindway:///auth/confirm in a build,
 * exp://…/--/auth/confirm in Expo Go, or https://<site>/auth/confirm in the web app (see
 * docs/supabase-setup.md). The code is exchanged once; the link's code and the session are never
 * logged or shown. On iPhone, a link asked for in the Home Screen app opens in Safari, which
 * can't finish the sign-in, but the email is confirmed by then, so it says to sign in there.
 */
export default function ConfirmEmail() {
  const params = useLocalSearchParams<{ code?: string; error_code?: string; error_description?: string; error?: string }>();
  // Only this link's own URL: the one that launched the app may be an older, different link.
  const linked = useLinkingURL();
  const url = linked?.includes('auth/confirm') ? linked : null;
  const { auth, user } = useSession();
  const [result, setResult] = useState<{ ok: boolean; message?: string; reference?: string; wasSignedIn?: boolean } | null>(null);
  const started = useRef(false);
  const callback = parseAuthCallback(url, params);
  const code = callback.kind === 'code' ? callback.code : null;

  useEffect(() => {
    if (started.current || !auth || !code) return;
    started.current = true;
    // Someone already signed in when the link opened means a new email address is being confirmed, not a new account.
    const wasSignedIn = !!user;
    void auth.exchangeCode(code).then((r) => setResult(r.ok ? { ok: true, wasSignedIn } : { ok: false, message: r.message, reference: r.reference }))
      // exchangeCode doesn't reject, but a screen stuck on "Confirming…" is worse than a generic failure.
      .catch(() => setResult({ ok: false, message: 'Something went wrong. Try again in a moment.' }));
  }, [auth, code, user]);

  const unusable = !auth
    ? { ok: false, message: 'Accounts aren’t available in this version of the app.' }
    : callback.kind === 'error'
      ? { ok: false, message: callback.message }
      : callback.kind === 'missing'
        ? { ok: false, message: 'This link is incomplete. Open the newest email from Kindway again.' }
        : null;
  // The first of an email change's two links: nothing to exchange, so it says what is left to do.
  const half = auth && callback.kind === 'message' ? callback.message : null;
  const shown = unusable ?? result;

  return (
    <Screen top={{ title: 'Confirm email' }}>
      {half ? (
        <StateView title="One link done" body={half} action={<Button label="Continue" onPress={() => router.replace('/')} />} />
      ) : !shown ? (
        <StateView title="Confirming…" body="This only takes a moment." />
      ) : shown.ok && 'wasSignedIn' in shown && shown.wasSignedIn ? (
        <StateView title="Email confirmed" body="Your email address is confirmed." action={<Button label="Continue" onPress={() => router.replace('/')} />} />
      ) : shown.ok ? (
        <StateView
          title="Email confirmed"
          body="You’re signed in. Nothing has been uploaded; you can choose whether to back up your journal next."
          action={<Button label="Continue" onPress={() => router.replace('/sync')} />}
        />
      ) : user ? (
        // A link opened again after it worked, or one for an account that is already signed in here.
        <StateView
          title="You’re already signed in"
          body={`This device is signed in as ${user.email || 'your account'}. If this link confirmed your email, that’s done; Settings shows the address you sign in with.`}
          action={<Button label="Continue" onPress={() => router.replace('/sync')} />}
        />
      ) : onWeb() && 'reference' in shown && shown.reference === 'pkce_verifier_missing' ? (
        <StateView
          title="Email confirmed"
          body="Open Kindway from your Home Screen and sign in with your email and password."
          action={<Button variant="secondary" label="Sign in here instead" onPress={() => router.replace('/account?mode=signin')} />}
        />
      ) : (
        <StateView
          title="Couldn’t confirm here"
          body={`${shown.message} If you already confirmed, on this or another device, your email is confirmed: just sign in.`}
          action={<Button label="Sign in" onPress={() => router.replace('/account?mode=signin')} />}
        />
      )}
    </Screen>
  );
}
