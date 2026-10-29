/**
 * Extra support for the Philippines: verified contacts, each with where and when it was checked,
 * that open the phone's dialler.
 */
import { fireEvent, renderRouter } from 'expo-router/testing-library';
import { Linking } from 'react-native';

import Support from '@/app/support';
import { SnackbarProvider } from '@/components/feedback';
import { EMERGENCY_NUMBER, SUPPORT_CONTACTS } from '@/data/support-contacts';
import { DemoStoreProvider, initialState } from '@/state/demo-store';

function Wrapped() {
  return (
    <DemoStoreProvider initial={initialState}>
      <SnackbarProvider>
        <Support />
      </SnackbarProvider>
    </DemoStoreProvider>
  );
}

const wait = { timeout: 8000 };
const dial = (number: string) => `tel:${number.replace(/[^0-9+]/g, '')}`;

describe('support contacts data', () => {
  it('has verified contacts, each with an official source and the date it was checked', () => {
    expect(SUPPORT_CONTACTS.length).toBeGreaterThanOrEqual(1);
    for (const c of SUPPORT_CONTACTS) {
      expect(c.source).toMatch(/^https:\/\//);
      expect(c.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.calls.length).toBeGreaterThanOrEqual(1);
      for (const line of [...c.calls, ...(c.texts ?? [])]) expect(line.number).toMatch(/^\+?[0-9 ()-]{3,20}$/);
    }
  });

  it('puts NCMH’s mobile numbers first, since both users call from mobile phones, and marks 1553 as a landline number', () => {
    const ncmh = SUPPORT_CONTACTS.find((c) => c.name === 'NCMH Crisis Hotline')!;
    expect(ncmh.calls[0].number).toMatch(/^09/);
    expect(ncmh.calls.find((l) => l.number === '1553')?.label).toBe('Call 1553 (landline)');
    expect(ncmh.calls.some((l) => /1800.*Smart/.test(l.label))).toBe(false);
  });

  it('names 911 as the emergency number and includes the NCMH crisis line', () => {
    expect(EMERGENCY_NUMBER).toBe('911');
    expect(SUPPORT_CONTACTS.map((c) => c.name)).toContain('NCMH Crisis Hotline');
  });
});

describe('the Extra support screen', () => {
  afterEach(() => jest.restoreAllMocks());

  it('tells people in danger to call 911', async () => {
    const screen = await renderRouter({ support: Wrapped }, { initialUrl: '/support' });
    expect(
      await screen.findByText('If you might act on thoughts of harming yourself or someone else, call 911 or go to the nearest emergency department.', {}, wait),
    ).toBeOnTheScreen();
  });

  it('lists every contact, with no placeholder left', async () => {
    const screen = await renderRouter({ support: Wrapped }, { initialUrl: '/support' });
    await fireEvent.press(await screen.findByRole('button', { name: 'See support options' }, wait));
    for (const c of SUPPORT_CONTACTS) expect(screen.getByText(c.name)).toBeOnTheScreen();
    expect(screen.queryByText(/Not available yet/)).toBeNull();
  });

  it('a call button opens the dialler with that number', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const screen = await renderRouter({ support: Wrapped }, { initialUrl: '/support' });
    await fireEvent.press(await screen.findByRole('button', { name: 'See support options' }, wait));
    const first = SUPPORT_CONTACTS[0].calls[0];
    await fireEvent.press(screen.getAllByRole('button', { name: first.label })[0]);
    expect(open).toHaveBeenCalledWith(dial(first.number));
  });
});
