import type { AuthError, SupabaseClient } from '@supabase/supabase-js';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Linking from 'expo-linking';

/**
 * Email/password auth on Supabase. Every call resolves to a result with a message written for
 * the person using the app; raw server errors, tokens and passwords are never logged or shown.
 */
/** `reference` is a safe error code (never a message, token or address) to quote when reporting a problem. */
export type AuthResult = { ok: true } | { ok: false; message: string; reference?: string };
export type SignUpResult = AuthResult | { ok: true; needsConfirmation: true };

export interface AuthService {
  signUp(email: string, password: string): Promise<SignUpResult>;
  signIn(email: string, password: string): Promise<AuthResult>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<AuthResult>;
  /** Finishes an email link (confirmation or password recovery) opened on this device. */
  exchangeCode(code: string): Promise<AuthResult>;
  updatePassword(password: string): Promise<AuthResult>;
  deleteAccount(): Promise<AuthResult>;
}

/**
 * Where email links send people back to. Every form must be allow-listed in Supabase
 * (docs/supabase-setup.md); otherwise Supabase silently uses its Site URL instead.
 * - Expo Go: back to the running dev server, `exp://<host>:8081/--/<path>` (`exps://` over an
 *   HTTPS tunnel). Only Expo Go can open these, and only while that server runs.
 * - Development and release builds: the app's own scheme, `kindway:///<path>`. Linking.createURL
 *   would add the dev server's address in a development build, which changes and isn't a route.
 */
export function redirectTo(path: 'auth/confirm' | 'reset-password') {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return Linking.createURL(`/${path}`);
  return `${Linking.resolveScheme({})}:///${path}`;
}

/** A safe identifier for an auth failure: its error code, else its HTTP status, else its class. */
export function authReference(error: { code?: string; status?: number; name?: string } | null | undefined): string | undefined {
  const code = error?.code && /^[a-z0-9_]{1,60}$/i.test(error.code) ? error.code : undefined;
  return code ?? (error?.status ? `http_${error.status}` : error?.name && /^\w{1,60}$/.test(error.name) ? error.name : undefined);
}

const failed = (error: Pick<AuthError, 'code' | 'status' | 'name' | 'message'>) => ({ ok: false as const, message: authMessage(error), reference: authReference(error) });

/** Anything thrown instead of returned (for example by a sign-in listener) is reported, not lost. */
const thrown = (e: unknown) => {
  const name = e instanceof Error ? e.name : undefined;
  return { ok: false as const, message: authMessage({ name, message: e instanceof Error ? e.message : '' } as AuthError), reference: authReference({ name }) ?? 'unexpected' };
};

/**
 * What an email link brought back. With PKCE a good link carries `?code=`; Supabase reports a
 * failed one (expired, already used) with `error_code`/`error_description`, in the fragment and,
 * for PKCE, also in the query. Expo Router only exposes the query, so the full URL is read too.
 */
export type AuthCallback = { kind: 'code'; code: string } | { kind: 'error'; message: string } | { kind: 'missing' };

export function parseAuthCallback(url: string | null | undefined, params: Record<string, string | string[] | undefined> = {}): AuthCallback {
  const found = new Map<string, string>();
  const take = (key: string, value: unknown) => {
    const v = Array.isArray(value) ? value[0] : value;
    if (typeof v === 'string' && v && !found.has(key)) found.set(key, v);
  };
  for (const [key, value] of Object.entries(params)) take(key, value);
  if (url) {
    const hash = url.indexOf('#');
    const query = url.indexOf('?');
    const parts = [query >= 0 ? url.slice(query + 1, hash > query ? hash : undefined) : '', hash >= 0 ? url.slice(hash + 1) : ''];
    for (const part of parts) {
      try {
        new URLSearchParams(part).forEach((value, key) => take(key, value));
      } catch {
        // A malformed part is treated as absent.
      }
    }
  }
  const errorCode = found.get('error_code');
  if (errorCode || found.has('error') || found.has('error_description'))
    return { kind: 'error', message: authMessage({ code: errorCode ?? (found.get('error') === 'access_denied' ? 'otp_expired' : undefined) } as AuthError) };
  const code = found.get('code');
  // Supabase codes are UUID-like; anything else is a mangled link and isn't sent to the server.
  if (code && /^[\w-]{8,200}$/.test(code)) return { kind: 'code', code };
  return { kind: 'missing' };
}

export function authMessage(error: Pick<AuthError, 'code' | 'status' | 'name' | 'message'> | null | undefined): string {
  const code = error?.code;
  if (error?.name === 'AuthRetryableFetchError' || /fetch|network/i.test(error?.message ?? ''))
    return "Couldn't reach Kindway's server. Check your connection and try again. Your journal on this device is unaffected.";
  switch (code) {
    case 'invalid_credentials':
      return "That email and password don't match. Check them and try again.";
    case 'email_not_confirmed':
      return 'Confirm your email first: open the link we sent you, then sign in.';
    case 'user_already_exists':
    case 'email_exists':
      return 'An account with this email already exists. Try signing in instead.';
    case 'weak_password':
      return 'Choose a longer or less common password.';
    case 'same_password':
      return 'Choose a password different from your current one.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Too many attempts for now. Wait a few minutes and try again.';
    case 'flow_state_expired':
    case 'flow_state_not_found':
    case 'otp_expired':
      return 'This link has expired or was already used. Request a new one.';
    case 'signup_disabled':
      return 'New accounts are not open right now.';
  }
  if (error?.status === 429) return 'Too many attempts for now. Wait a few minutes and try again.';
  return 'Something went wrong. Try again in a moment.';
}

export function supabaseAuth(client: SupabaseClient): AuthService {
  return {
    async signUp(email, password) {
      const emailRedirectTo = redirectTo('auth/confirm');
      // Development only, and only the address the link returns to: compare it with the email's redirect_to.
      if (__DEV__) console.info(`[auth] confirmation links return to ${emailRedirectTo}`);
      const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo } }).catch((e: unknown) => ({ data: null, error: e as AuthError }));
      if (error || !data) return error ? failed(error) : thrown(null);
      // With confirmations on, an existing address also returns a user with no identities.
      if (data.user && data.user.identities?.length === 0) return { ok: false, message: authMessage({ code: 'user_already_exists' } as AuthError) };
      return data.session ? { ok: true } : { ok: true, needsConfirmation: true };
    },
    async signIn(email, password) {
      try {
        const { error } = await client.auth.signInWithPassword({ email, password });
        return error ? failed(error) : { ok: true };
      } catch (e) {
        return thrown(e);
      }
    },
    async signOut() {
      // Only this device; the account stays signed in elsewhere.
      await client.auth.signOut({ scope: 'local' }).catch(() => {});
    },
    async requestPasswordReset(email) {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: redirectTo('reset-password') });
      return error ? { ok: false, message: authMessage(error) } : { ok: true };
    },
    async exchangeCode(code) {
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error) return { ok: true };
      if (error.name === 'AuthPKCECodeVerifierMissingError')
        return { ok: false, message: 'Open this link on the device where you asked for it, or request a new one here.' };
      return { ok: false, message: authMessage(error) };
    },
    async updatePassword(password) {
      const { error } = await client.auth.updateUser({ password });
      return error ? { ok: false, message: authMessage(error) } : { ok: true };
    },
    async deleteAccount() {
      const { error } = await client.functions.invoke('delete-account', { method: 'POST' });
      if (!error) return { ok: true };
      const status = (error as { context?: { status?: number } }).context?.status;
      if (error.name === 'FunctionsFetchError') return { ok: false, message: "Couldn't reach Kindway's server. Nothing was deleted. Try again when you're online." };
      if (status === 404) return { ok: false, message: 'Account deletion isn’t set up on the server yet. Nothing was deleted.' };
      if (status === 401) return { ok: false, message: 'Sign in again, then retry. Nothing was deleted.' };
      return { ok: false, message: 'The account couldn’t be deleted. Nothing was removed; try again later.' };
    },
  };
}
