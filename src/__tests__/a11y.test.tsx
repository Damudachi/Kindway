/**
 * Every control a screen reader can reach has a name: what TalkBack (Android) and VoiceOver read
 * out. Checked on the main screens with fictional content; text fields need a label too.
 */
import { renderRouter } from 'expo-router/testing-library';

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
import Support from '@/app/support';
import Tomorrow from '@/app/tomorrow';
import Voice from '@/app/voice';
import Composer from '@/app/write';
import { SnackbarProvider } from '@/components/feedback';
import { DemoStoreProvider, initialState, type DemoState } from '@/state/demo-store';
import { entry } from '@/test-utils/entries';

const state: DemoState = { ...initialState, onboarded: true, entries: [entry('e1', 0, { title: 'Fictional entry', feelings: ['Calm'] }), entry('e2', 2)] };

function withProviders(Screen: () => React.ReactElement | null) {
  return function Wrapped() {
    return (
      <DemoStoreProvider initial={state}>
        <SnackbarProvider>
          <Screen />
        </SnackbarProvider>
      </DemoStoreProvider>
    );
  };
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
];

describe('every control has a name a screen reader can read', () => {
  it.each(SCREENS)('%s', async (route, url, Screen) => {
    const screen = await renderRouter({ [route]: withProviders(Screen) }, { initialUrl: url });
    await screen.findAllByRole('button', {}, { timeout: 8000 });
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
