import { View } from 'react-native';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';

import { MILESTONE_COPY, MILESTONES } from '@/state/trail-progress';
import { useTheme } from '@/theme/theme';

type Name = (typeof MILESTONE_COPY)[(typeof MILESTONES)[number]]['scenery'];
type Palette = ReturnType<typeof useTheme>['color'];

const HEIGHT = 48;
const GROUND = 44;

/** Small quiet motifs, drawn in the illustrations' 2px line weight on a 320x48 strip. Each unlocked milestone adds one layer. */
const LAYERS: Record<Name, (c: Palette) => React.ReactNode> = {
  sunrise: (c) => (
    <>
      <Path d="M238 44 A22 22 0 0 1 282 44" fill="none" stroke={c.lantern} strokeOpacity={0.55} strokeWidth={2} strokeLinecap="round" />
      <Path d="M246 44 A14 14 0 0 1 274 44 Z" fill={c.lantern} fillOpacity={0.18} />
    </>
  ),
  stars: (c) => (
    <G fill={c.lantern} fillOpacity={0.55}>
      <Circle cx={36} cy={9} r={1.6} />
      <Circle cx={92} cy={16} r={1.2} />
      <Circle cx={150} cy={7} r={1.6} />
      <Circle cx={204} cy={14} r={1.2} />
      <Circle cx={262} cy={8} r={1.6} />
      <Circle cx={302} cy={18} r={1.2} />
    </G>
  ),
  autumn: (c) => (
    <G fill={c.lantern} fillOpacity={0.4}>
      <Path d="M20 40 q4 -6 8 0 q-4 3 -8 0 Z" />
      <Path d="M116 41 q4 -6 8 0 q-4 3 -8 0 Z" />
      <Path d="M186 38 q4 -6 8 0 q-4 3 -8 0 Z" />
      <Path d="M290 41 q4 -6 8 0 q-4 3 -8 0 Z" />
    </G>
  ),
  bench: (c) => (
    <G stroke={c.trail} strokeOpacity={0.7} strokeWidth={2} strokeLinecap="round">
      <Line x1={196} y1={32} x2={220} y2={32} />
      <Line x1={196} y1={26} x2={220} y2={26} />
      <Line x1={199} y1={32} x2={199} y2={GROUND} />
      <Line x1={217} y1={32} x2={217} y2={GROUND} />
    </G>
  ),
  fireflies: (c) => (
    <G fill={c.lantern}>
      {[
        [62, 22],
        [130, 14],
        [172, 26],
        [248, 20],
      ].map(([x, y]) => (
        <G key={x}>
          <Circle cx={x} cy={y} r={5} fillOpacity={0.12} />
          <Circle cx={x} cy={y} r={1.8} fillOpacity={0.75} />
        </G>
      ))}
    </G>
  ),
  wildflowers: (c) => (
    <G>
      {[28, 52, 100, 144, 228, 270, 296].map((x, i) => (
        <G key={x}>
          <Line x1={x} y1={GROUND} x2={x} y2={GROUND - 7 - (i % 3) * 2} stroke={c.lichen} strokeWidth={2} strokeLinecap="round" />
          <Circle cx={x} cy={GROUND - 9 - (i % 3) * 2} r={2.4} fill={i % 2 ? c.lantern : c.trail} fillOpacity={0.75} />
        </G>
      ))}
    </G>
  ),
};

/** Drawn back to front so nothing hides the flowers. */
const ORDER: Name[] = ['sunrise', 'stars', 'autumn', 'bench', 'fireflies', 'wildflowers'];

/** What the trail has grown, as a quiet strip above its stops. Decorative: hidden from screen readers. */
export function TrailScenery({ unlocks }: { unlocks: number[] }) {
  const { color } = useTheme();
  const names = new Set(MILESTONES.filter((m) => unlocks.includes(m)).map((m) => MILESTONE_COPY[m].scenery));
  if (names.size === 0) return null;
  return (
    <View testID="trail-scenery" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ height: HEIGHT }}>
      <Svg width="100%" height={HEIGHT} viewBox={`0 0 320 ${HEIGHT}`} preserveAspectRatio="xMidYMax meet">
        <Line x1={8} y1={GROUND + 1} x2={312} y2={GROUND + 1} stroke={color.sand} strokeWidth={2} strokeLinecap="round" />
        {ORDER.filter((n) => names.has(n)).map((n) => (
          <G key={n} testID={`scenery-${n}`}>
            {LAYERS[n](color)}
          </G>
        ))}
      </Svg>
    </View>
  );
}
