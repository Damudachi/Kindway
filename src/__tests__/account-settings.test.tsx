import { router, Slot } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import ChangeEmail from '@/app/settings/email';
import ChangePassword from '@/app/settings/password';
import { SnackbarProvider } from '@/components/feedback';
import type { AuthResult, AuthService } from '@/services/auth';
import { SessionProvider, type AuthUser } from '@/state/session';

jest.setTimeout(30000);

const USER: AuthUser = { id: 'u1', email: 'a@example.test' };
const OK: AuthResult = { ok: true };
const wait = { timeout: 8000 };

/** A signed-in session over a fake AuthService; the layout keeps the snackbar alive across screens. */
function withAccount(auth: Partial<AuthService>) {
  const watchUser = (on: (u: AuthUser | null) => void) => {
    on(USER);
    return () => {};
  };
  return function Layout() {
    return (
      <SessionProvider auth={auth as AuthService} watchUser={watchUser}>
        <SnackbarProvider>
          <Slot />
        </SnackbarProvider>
      </SessionProvider>
    );
  };
}

const Stub = (label: string) =>
  function StubScreen() {
    return <Text>{label}</Text>;
  };

async function openChangePassword(auth: Partial<AuthService>) {
  await renderRouter(
    { _layout: withAccount(auth), 'settings/index': Stub('Settings screen'), 'settings/password': ChangePassword, account: Stub('Account screen') },
    { initialUrl: '/settings/password' },
  );
  return screen;
}

async function fill(current: string, next: string) {
  await fireEvent.changeText(await screen.findByLabelText('Current password', {}, wait), current);
  await fireEvent.changeText(screen.getByLabelText('New password'), next);
  await fireEvent.press(screen.getByRole('button', { name: 'Change password' }));
}

describe('change password', () => {
  it('wrong current password is refused and the password is not changed', async () => {
    const auth = {
      signIn: jest.fn(async (): Promise<AuthResult> => ({ ok: false, message: "That email and password don't match. Check them and try again.", reference: 'invalid_credentials' })),
      updatePassword: jest.fn(async () => OK),
    };
    await openChangePassword(auth);
    await fill('old', 'newpassword1');
    expect(await screen.findByText('That isn’t your current password.', {}, wait)).toBeOnTheScreen();
    expect(auth.signIn).toHaveBeenCalledWith(USER.email, 'old');
    expect(auth.updatePassword).not.toHaveBeenCalled();
  });

  it('new password under 8 characters is refused before any request', async () => {
    const auth = { signIn: jest.fn(async () => OK), updatePassword: jest.fn(async () => OK) };
    await openChangePassword(auth);
    await fill('old', 'short');
    expect(await screen.findByText('Use at least 8 characters.', {}, wait)).toBeOnTheScreen();
    expect(auth.signIn).not.toHaveBeenCalled();
    expect(auth.updatePassword).not.toHaveBeenCalled();
  });

  it('right current password changes it and returns to Settings', async () => {
    const auth = { signIn: jest.fn(async () => OK), updatePassword: jest.fn(async () => OK) };
    // Start on Settings so "back" has somewhere to go.
    await renderRouter(
      { _layout: withAccount(auth), 'settings/index': Stub('Settings screen'), 'settings/password': ChangePassword },
      { initialUrl: '/settings' },
    );
    await act(async () => router.push('/settings/password'));
    await fill('old', 'newpassword1');
    expect(await screen.findByText('Password changed.', {}, wait)).toBeOnTheScreen();
    expect(auth.updatePassword).toHaveBeenCalledWith('newpassword1');
    expect(screen).toHavePathname('/settings');
  });

  it.each([
    ['the check', { signIn: jest.fn(async () => Promise.reject(new Error('boom'))), updatePassword: jest.fn(async () => OK) }],
    ['the change', { signIn: jest.fn(async () => OK), updatePassword: jest.fn(async () => Promise.reject(new Error('boom'))) }],
  ])('if %s throws, it says so and the button works again', async (_what, auth) => {
    await openChangePassword(auth);
    await fill('old', 'newpassword1');
    expect(await screen.findByText('Something went wrong. Try again in a moment.', {}, wait)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Change password' })).toBeEnabled();
    expect(screen.queryByText('Password changed.')).toBeNull();
  });

  it('forgot link opens the reset flow', async () => {
    await openChangePassword({ signIn: jest.fn(async () => OK), updatePassword: jest.fn(async () => OK) });
    await fireEvent.press(await screen.findByRole('button', { name: 'Forgot your current password?' }, wait));
    expect(await screen.findByText('Account screen', {}, wait)).toBeOnTheScreen();
    expect(screen).toHavePathname('/account');
    expect(screen).toHaveSearchParams({ mode: 'forgot' });
  });
});

describe('change email', () => {
  const open = (auth: Partial<AuthService>) => renderRouter({ _layout: withAccount(auth), 'settings/email': ChangeEmail }, { initialUrl: '/settings/email' });

  it('change email sends links and explains both addresses', async () => {
    const auth = { changeEmail: jest.fn(async () => OK) };
    await open(auth);
    await fireEvent.changeText(await screen.findByLabelText('New email address', {}, wait), 'new@example.test');
    await fireEvent.press(screen.getByRole('button', { name: 'Send confirmation links' }));
    expect(await screen.findByText(/We sent a link to both your current and new address/, {}, wait)).toBeOnTheScreen();
    expect(auth.changeEmail).toHaveBeenCalledWith('new@example.test');
    expect(screen.getByRole('button', { name: 'Done' })).toBeOnTheScreen();
  });

  it('invalid address is refused before any request', async () => {
    const auth = { changeEmail: jest.fn(async () => OK) };
    await open(auth);
    await fireEvent.changeText(await screen.findByLabelText('New email address', {}, wait), 'nope');
    await fireEvent.press(screen.getByRole('button', { name: 'Send confirmation links' }));
    expect(await screen.findByText('Enter an email address like name@example.com.', {}, wait)).toBeOnTheScreen();
    expect(auth.changeEmail).not.toHaveBeenCalled();
  });

  it('the current address is refused before any request', async () => {
    const auth = { changeEmail: jest.fn(async () => OK) };
    await open(auth);
    await fireEvent.changeText(await screen.findByLabelText('New email address', {}, wait), ' A@Example.test ');
    await fireEvent.press(screen.getByRole('button', { name: 'Send confirmation links' }));
    expect(await screen.findByText('That’s already your email address.', {}, wait)).toBeOnTheScreen();
    expect(auth.changeEmail).not.toHaveBeenCalled();
  });

  it('an address another account uses says so, without suggesting signing in', async () => {
    const auth = {
      changeEmail: jest.fn(async (): Promise<AuthResult> => ({ ok: false, message: 'An account with this email already exists. Try signing in instead.', reference: 'email_exists' })),
    };
    await open(auth);
    await fireEvent.changeText(await screen.findByLabelText('New email address', {}, wait), 'taken@example.test');
    await fireEvent.press(screen.getByRole('button', { name: 'Send confirmation links' }));
    expect(await screen.findByText('Another account already uses this email address.', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText(/Try signing in/)).toBeNull();
  });

  it('a failure is shown and nothing claims the links were sent', async () => {
    const auth = { changeEmail: jest.fn(async (): Promise<AuthResult> => ({ ok: false, message: 'That address is already in use.' })) };
    await open(auth);
    await fireEvent.changeText(await screen.findByLabelText('New email address', {}, wait), 'new@example.test');
    await fireEvent.press(screen.getByRole('button', { name: 'Send confirmation links' }));
    expect(await screen.findByText('That address is already in use.', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText(/We sent a link/)).toBeNull();
  });
});
