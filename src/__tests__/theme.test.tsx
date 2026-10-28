import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text, View } from 'react-native';

import { memoryStorage } from '@/storage/persistence';
import { makeStyles, ThemeProvider, useTheme, type Appearance } from '@/theme/theme';
import { COMPASS_AREAS, FEELINGS } from '@/data/sample';
import { palettes, tints } from '@/theme/tokens';

const useStyles = makeStyles((color) => ({ box: { backgroundColor: color.paper } }));

function Probe() {
  const { scheme, color, appearance, setAppearance } = useTheme();
  const styles = useStyles();
  const pick = (a: Appearance) => () => void setAppearance(a);
  return (
    <>
      <Text>scheme:{scheme}</Text>
      <Text>appearance:{appearance}</Text>
      <Text>paper:{color.paper}</Text>
      <View testID="box" style={styles.box} />
      <Pressable accessibilityRole="button" onPress={pick('night')}>
        <Text>night</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={pick('system')}>
        <Text>system</Text>
      </Pressable>
    </>
  );
}

test('both palettes name the same roles', () => {
  expect(Object.keys(palettes.night).sort()).toEqual(Object.keys(palettes.light).sort());
});

test('every feeling and compass area has a hue in both schemes', () => {
  for (const scheme of ['light', 'night'] as const) {
    expect(Object.keys(tints[scheme].feeling).sort()).toEqual([...FEELINGS].sort());
    expect(Object.keys(tints[scheme].area).sort()).toEqual([...COMPASS_AREAS].sort());
  }
});

test('follows the system scheme until the user picks one', async () => {
  const storage = memoryStorage();
  await render(
    <ThemeProvider storage={storage}>
      <Probe />
    </ThemeProvider>,
  );
  expect(await screen.findByText('appearance:system')).toBeTruthy();
  expect(screen.getByText('scheme:light')).toBeTruthy();
  expect(screen.getByText(`paper:${palettes.light.paper}`)).toBeTruthy();
});

// react-native-web's Appearance has no setColorScheme; calling it crashed the web app at launch.
test('starts, and switches, where the platform can’t set a native scheme (the web)', async () => {
  const { Appearance } = jest.requireActual<typeof import('react-native')>('react-native');
  const original = Appearance.setColorScheme;
  (Appearance as { setColorScheme?: unknown }).setColorScheme = undefined;
  try {
    await render(
      <ThemeProvider storage={memoryStorage({ appearance: 'light' })}>
        <Probe />
      </ThemeProvider>,
    );
    expect(await screen.findByText('appearance:light')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'night' }));
    expect(await screen.findByText('appearance:night')).toBeTruthy();
  } finally {
    Appearance.setColorScheme = original;
  }
});

test('choosing Night switches palettes and styles, and the choice persists', async () => {
  const storage = memoryStorage();
  const view = await render(
    <ThemeProvider storage={storage}>
      <Probe />
    </ThemeProvider>,
  );
  await screen.findByText('appearance:system');

  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'night' })));

  expect(screen.getByText('scheme:night')).toBeTruthy();
  expect(screen.getByText(`paper:${palettes.night.paper}`)).toBeTruthy();
  expect(screen.getByTestId('box')).toHaveStyle({ backgroundColor: palettes.night.paper });
  expect(storage.current).toEqual({ appearance: 'night' });

  await view.unmount();
  await render(
    <ThemeProvider storage={storage}>
      <Probe />
    </ThemeProvider>,
  );
  expect(await screen.findByText('appearance:night')).toBeTruthy();
  expect(screen.getByText('scheme:night')).toBeTruthy();

  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'system' })));
  expect(screen.getByText('scheme:light')).toBeTruthy();
  expect(storage.current).toEqual({ appearance: 'system' });
});

test('components outside a provider get the light palette', async () => {
  await render(<Probe />);
  expect(screen.getByText('scheme:light')).toBeTruthy();
});

/** WCAG relative luminance contrast of two #RRGGBB colours. */
function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Every text colour on every surface it's used on, in both schemes (WCAG AA: 4.5 for text,
// 3 for control borders). Lantern itself is for marks only and isn't listed. `sunk` isn't a text
// surface: it fills loading placeholders and disabled buttons (which WCAG exempts).
test.each(['light', 'night'] as const)('text and controls are readable on every surface (%s)', (scheme) => {
  const c = palettes[scheme];
  const failures: string[] = [];
  const need = (fg: keyof typeof c, bg: keyof typeof c, min: number) => {
    const ratio = contrast(c[fg], c[bg]);
    if (ratio < min) failures.push(`${fg} on ${bg}: ${ratio.toFixed(2)} < ${min}`);
  };
  for (const bg of ['paper', 'raised', 'card'] as const) {
    for (const fg of ['ink', 'inkMuted', 'pencil', 'trail', 'lanternInk', 'lichenInk', 'danger'] as const) need(fg, bg, 4.5);
    need('outline', bg, 3);
  }
  need('onPrimary', 'primary', 4.5);
  need('onInk', 'ink', 4.5);
  need('onTrailContainer', 'trailContainer', 4.5);
  need('onLanternContainer', 'lanternContainer', 4.5);
  need('danger', 'dangerContainer', 4.5);
  need('ink', 'bar', 4.5);
  need('ink', 'barIndicator', 4.5);
  expect(failures).toEqual([]);
});
