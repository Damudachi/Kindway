/**
 * Every control a screen reader can reach has a name: what TalkBack (Android) and VoiceOver read
 * out. Checked on the main screens with fictional content; text fields need a label too.
 */
import { renderRouter } from 'expo-router/testing-library';

import Account from '@/app/(onboarding)/account';
import Compass from '@/app/(tabs)/compass';
import Journal from '@/app/(tabs)/journal';
import Patterns from '@/app/(tabs)/patterns';
import Today from '@/app/(tabs)/today';
import EntryDetail from '@/app/entry/[id]/index';
import AiConsent from '@/app/settings/ai-consent';
import AiMemory from '@/app/settings/ai-memory';
import Settings from '@/app/settings/index';
import Privacy from '@/app/settings/privacy';
import Reminders from '@/app/settings/reminders';
import ResetPassword from '@/app/reset-password';
import Support from '@/app/support';
import Tomorrow from '@/app/tomorrow';
import Voice from '@/app/voice';
import Composer from '@/app/write';
import ChangeEmail from '@/app/settings/email';
import ChangePassword from '@/app/settings/password';
import { SnackbarProvider } from '@/components/feedback';
import type { AuthService } from '@/services/auth';
import type { LockService } from '@/services/app-lock';
import { AppLock } from '@/state/app-lock';
import { DemoStoreProvider, initialState, type DemoState } from '@/state/demo-store';
import { SessionProvider, type AuthUser } from '@/state/session';
import { memoryStorage } from '@/storage/persistence';
import { entry } from '@/test-utils/entries';

const state: DemoState = { ...initialState, onboarded: true, entries: [entry('e1', 0, { title: 'Fictional entry', feelings: ['Calm'] }), entry('e2', 2)] };

const USER: AuthUser = { id: 'u1', email: 'a@example.test' };

function withProviders(Screen: () => React.ReactElement | null, signedIn = false) {
  return function Wrapped() {
    const page = (
      <DemoStoreProvider initial={state}>
        <SnackbarProvider>
          <Screen />
        </SnackbarProvider>
      </DemoStoreProvider>
    );
    // Change email and Change password need a signed-in session (as in account-settings.test.tsx).
    return signedIn ? (
      <SessionProvider auth={{} as AuthService} watchUser={(on) => (on(USER), () => {})}>
        {page}
      </SessionProvider>
    ) : (
      page
    );
  };
}

/** The app lock's cover, up and waiting: the phone's prompt was cancelled. */
function LockedJournal() {
  const service: LockService = { lockSupport: async () => 'ready', authenticate: async () => false, hideFromRecents: async () => {} };
  return (
    <AppLock storage={memoryStorage({ enabled: true })} lockService={service}>
      <Journal />
    </AppLock>
  );
}

type Host = { type: unknown; props: Record<string, unknown>; children: (Host | string)[] };
/** The text fields on screen (host TextInputs). */
const textFields = (node: Host | string | null, out: Host[] = []): Host[] => {
  if (!node || typeof node === 'string') return out;
  if (node.type === 'TextInput') out.push(node);
  for (const child of node.children ?? []) textFields(child, out);
  return out;
};

const ROLES = ['button', 'switch', 'checkbox', 'radio', 'tab', 'link', 'adjustable'] as const;

const SCREENS: [string, string, () => React.ReactElement | null][] = [
  ['today', '/today', Today],
  ['journal', '/journal', Journal],
  ['patterns', '/patterns', Patterns],
  ['compass', '/compass', Compass],
  ['entry/[id]', '/entry/e1', EntryDetail],
  ['write', '/write', Composer],
  ['settings/index', '/settings', Settings],
  ['settings/ai-consent', '/settings/ai-consent', AiConsent],
  ['settings/ai-memory', '/settings/ai-memory', AiMemory],
  ['settings/privacy', '/settings/privacy', Privacy],
  ['settings/reminders', '/settings/reminders', Reminders],
  ['support', '/support', Support],
  ['tomorrow', '/tomorrow', Tomorrow],
  ['voice', '/voice', Voice],
  ['account', '/account?mode=signin', Account],
  ['reset-password', '/reset-password', ResetPassword],
  ['settings/email', '/settings/email', ChangeEmail],
  ['settings/password', '/settings/password', ChangePassword],
  ['lock-cover', '/lock-cover', LockedJournal],
];

/** Screens that need a signed-in session. */
const SIGNED_IN = new Set(['settings/email', 'settings/password']);

describe('every control has a name a screen reader can read', () => {
  it.each(SCREENS)('%s', async (route, url, Screen) => {
    const screen = await renderRouter({ [route]: withProviders(Screen, SIGNED_IN.has(route)) }, { initialUrl: url });
    await screen.findAllByRole('button', {}, { timeout: 8000 });
    // The lock cover really is up, with its own button, not the journal's.
    if (route === 'lock-cover') await screen.findByRole('button', { name: 'Unlock Kindway' }, { timeout: 8000 });
    for (const role of ROLES) {
      const all = screen.queryAllByRole(role);
      const named = screen.queryAllByRole(role, { name: /\S/ });
      expect({ role, unnamed: all.length - named.length }).toEqual({ role, unnamed: 0 });
    }
    // The composer has a text field, so the walk really finds fields.
    if (route === 'write') expect(textFields(screen.root as unknown as Host).length).toBeGreaterThan(0);
    for (const field of textFields(screen.root as unknown as Host)) {
      expect({ field: field.props.placeholder ?? 'text field', label: Boolean(field.props.accessibilityLabel || field.props['aria-label']) }).toEqual({
        field: field.props.placeholder ?? 'text field',
        label: true,
      });
    }
  });
});
