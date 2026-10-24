import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text, View } from 'react-native';

import { memoryStorage } from '@/storage/persistence';
import { makeStyles, ThemeProvider, useTheme, type Appearance } from '@/theme/theme';
import { palettes } from '@/theme/tokens';

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
