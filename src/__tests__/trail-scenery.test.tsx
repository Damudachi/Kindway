import { render, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import Today from '@/app/(tabs)/today';
import { TrailScenery } from '@/components/trail-scenery';
import { DemoStoreProvider, initialState, type DemoState } from '@/state/demo-store';
import { entry } from '@/test-utils/entries';

// The scenery is decorative and hidden from screen readers, so queries must look past that.
const HIDDEN = { includeHiddenElements: true };
const NAMES = ['wildflowers', 'fireflies', 'bench', 'autumn', 'stars', 'sunrise'];

describe('TrailScenery', () => {
  it('draws one layer per unlocked milestone, and only those', async () => {
    await render(<TrailScenery unlocks={[7, 30]} />);
    expect(screen.getByTestId('scenery-wildflowers', HIDDEN)).toBeOnTheScreen();
    expect(screen.getByTestId('scenery-fireflies', HIDDEN)).toBeOnTheScreen();
    for (const n of ['bench', 'autumn', 'stars', 'sunrise']) expect(screen.queryByTestId(`scenery-${n}`, HIDDEN)).toBeNull();
  });

  it('draws nothing when nothing is unlocked', async () => {
    await render(<TrailScenery unlocks={[]} />);
    for (const n of NAMES) expect(screen.queryByTestId(`scenery-${n}`, HIDDEN)).toBeNull();
    expect(screen.toJSON()).toBeNull();
  });

  it('copes with unsorted unlocks and draws all six', async () => {
    await render(<TrailScenery unlocks={[365, 7, 200, 100, 50, 30]} />);
    for (const n of NAMES) expect(screen.getByTestId(`scenery-${n}`, HIDDEN)).toBeOnTheScreen();
  });

  it('is decorative: hidden from screen readers', async () => {
    await render(<TrailScenery unlocks={[7]} />);
    expect(screen.getByTestId('trail-scenery', HIDDEN).props.importantForAccessibility).toBe('no-hide-descendants');
    expect(screen.getByTestId('trail-scenery', HIDDEN).props.accessibilityElementsHidden).toBe(true);
  });
});

async function today(patch: Partial<DemoState>) {
  function Wrapped() {
    return (
      <DemoStoreProvider initial={{ ...initialState, onboarded: true, ...patch }}>
        <Today />
      </DemoStoreProvider>
    );
  }
  await renderRouter({ today: Wrapped }, { initialUrl: '/today' });
}

describe('the count on the Today trail card', () => {
  it('says how many days were written, without a full stop', async () => {
    const entries = Array.from({ length: 23 }, (_, i) => entry(`e${i}`, i));
    await today({ entries, trailUnlocks: [7] });
    expect(await screen.findByText('23 days on your way')).toBeOnTheScreen();
    expect(screen.getByTestId('scenery-wildflowers', HIDDEN)).toBeOnTheScreen();
  });

  it('says "1 day" for a single day', async () => {
    await today({ entries: [entry('a', 0)] });
    expect(await screen.findByText('1 day on your way')).toBeOnTheScreen();
  });

  it('shows the empty copy and no count with no entries', async () => {
    await today({ entries: [] });
    expect(await screen.findByText('Your trail starts with your first entry. There’s no pace to keep.')).toBeOnTheScreen();
    expect(screen.queryByText(/on your way/)).toBeNull();
  });
});
