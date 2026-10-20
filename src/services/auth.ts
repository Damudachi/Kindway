import type { AuthError, SupabaseClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';

/**
 * Email/password auth on Supabase. Every call resolves to a result with a message written for
 * the person using the app; raw server errors, tokens and passwords are never logged or shown.
 */
export type AuthResult = { ok: true } | { ok: false; message: string };
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

/** Where email links send people back to. Matches the redirect URLs in docs/supabase-setup.md. */
export const redirectTo = (path: 'auth/confirm' | 'reset-password') => Linking.createURL(`/${path}`);

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
      const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo('auth/confirm') } });
      if (error) return { ok: false, message: authMessage(error) };
      // With confirmations on, an existing address also returns a user with no identities.
      if (data.user && data.user.identities?.length === 0) return { ok: false, message: authMessage({ code: 'user_already_exists' } as AuthError) };
      return data.session ? { ok: true } : { ok: true, needsConfirmation: true };
    },
    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      return error ? { ok: false, message: authMessage(error) } : { ok: true };
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
