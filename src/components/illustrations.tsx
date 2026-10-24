import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';

import type { IconName } from '@/components/button';
import { Text } from '@/components/text';
import { COMPASS_AREAS } from '@/data/sample';
import { makeStyles, useTheme } from '@/theme/theme';
import { space } from '@/theme/tokens';

/**
 * Small line drawings in the trail's own hand: 2dp strokes, slate lines, sand ground, one lantern
 * mark. Decorative only; the copy beside them says everything, so they're hidden from TalkBack.
 */
function Art({ children }: { children: ReactNode }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={160} height={96} viewBox="0 0 160 96">
        {children}
      </Svg>
    </View>
  );
}

export type ArtName = 'trailhead' | 'map' | 'compass' | 'talk';

/** A trailhead post with a painted blaze, and the trail winding off into the distance. */
function Trailhead() {
  const { color } = useTheme();
  return (
    <Art>
      <Line x1={8} y1={86} x2={152} y2={86} stroke={color.sand} strokeWidth={2} strokeLinecap="round" />
      <Path d="M30 86 C 64 74, 44 60, 86 52 S 122 38, 146 30" fill="none" stroke={color.trail} strokeOpacity={0.6} strokeWidth={2} strokeDasharray="4 5" strokeLinecap="round" />
      <Rect x={84} y={44} width={3} height={7} rx={0.5} fill={color.trail} />
      <Rect x={124} y={31} width={3} height={7} rx={0.5} fill={color.trail} />
      <Line x1={40} y1={34} x2={40} y2={86} stroke={color.trail} strokeWidth={2} strokeLinecap="round" />
      <Rect x={22} y={30} width={34} height={14} rx={2} fill={color.paper} stroke={color.trail} strokeWidth={2} />
      <Rect x={37} y={56} width={6} height={16} rx={0.5} fill={color.lantern} />
    </Art>
  );
}

/** A folded map with a dashed route that ends at a lantern blaze. */
function FoldedMap() {
  const { color } = useTheme();
  return (
    <Art>
      <Path d="M20 22 L60 14 L100 22 L140 14 L140 78 L100 86 L60 78 L20 86 Z" fill={color.raised} stroke={color.trail} strokeWidth={2} strokeLinejoin="round" />
      <Line x1={60} y1={14} x2={60} y2={78} stroke={color.sand} strokeWidth={2} />
      <Line x1={100} y1={22} x2={100} y2={86} stroke={color.sand} strokeWidth={2} />
      <Path d="M34 70 C 52 50, 70 68, 86 50 S 114 36, 124 34" fill="none" stroke={color.trail} strokeOpacity={0.7} strokeWidth={2} strokeDasharray="3 4" strokeLinecap="round" />
      <Rect x={125} y={25} width={6} height={16} rx={0.5} fill={color.lantern} />
    </Art>
  );
}

/** A compass rose: a ring, four bearings, and a lantern needle pointing north. */
function Rose() {
  const { color } = useTheme();
  return (
    <Art>
      <Circle cx={80} cy={48} r={34} fill="none" stroke={color.trail} strokeWidth={2} />
      <Circle cx={80} cy={48} r={26} fill="none" stroke={color.sand} strokeWidth={2} />
      <G stroke={color.trail} strokeWidth={2} strokeLinecap="round">
        <Line x1={80} y1={6} x2={80} y2={14} />
        <Line x1={80} y1={82} x2={80} y2={90} />
        <Line x1={38} y1={48} x2={46} y2={48} />
        <Line x1={114} y1={48} x2={122} y2={48} />
      </G>
      <Path d="M80 24 L86 48 L80 44 L74 48 Z" fill={color.lantern} />
      <Path d="M80 72 L86 48 L80 52 L74 48 Z" fill="none" stroke={color.trail} strokeWidth={2} strokeLinejoin="round" />
    </Art>
  );
}

/** Two speech outlines: yours in ink-slate, the reply still in pencil. */
function Talk() {
  const { color } = useTheme();
  return (
    <Art>
      <Path d="M26 18 H92 A8 8 0 0 1 100 26 V46 A8 8 0 0 1 92 54 H46 L34 64 V54 H26 A8 8 0 0 1 18 46 V26 A8 8 0 0 1 26 18 Z" fill={color.raised} stroke={color.trail} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M68 44 H134 A8 8 0 0 1 142 52 V70 A8 8 0 0 1 134 78 H128 V88 L116 78 H68 A8 8 0 0 1 60 70 V52 A8 8 0 0 1 68 44 Z" fill={color.paper} stroke={color.pencil} strokeWidth={2} strokeDasharray="4 4" strokeLinejoin="round" />
      <Circle cx={88} cy={61} r={2.5} fill={color.lantern} />
      <Circle cx={100} cy={61} r={2.5} fill={color.lantern} />
      <Circle cx={112} cy={61} r={2.5} fill={color.lantern} />
    </Art>
  );
}

const ART: Record<ArtName, () => ReactNode> = { trailhead: Trailhead, map: FoldedMap, compass: Rose, talk: Talk };

export function Illustration({ name }: { name: ArtName }) {
  const Drawing = ART[name];
  return <Drawing />;
}

/**
 * A seven-point rose, one point per compass area: chosen areas are filled in their own hue,
 * the rest stay as sand outlines. Decorative: the list below names every area.
 */
export function CompassRose({ areas, size = 128 }: { areas: string[]; size?: number }) {
  const { color, tint } = useTheme();
  const c = size / 2;
  const r = c - 6;
  const at = (a: number, d: number) => `${c + Math.cos(a) * d} ${c + Math.sin(a) * d}`;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size}>
        <Circle cx={c} cy={c} r={r} fill="none" stroke={color.sand} strokeWidth={2} />
        {COMPASS_AREAS.map((area, i) => {
          const a = ((i * 360) / COMPASS_AREAS.length - 90) * (Math.PI / 180);
          const side = 0.32; // half-width of a point, in radians at its shoulder
          return (
            <Path
              key={area}
              d={`M${c} ${c} L${at(a - side, r * 0.28)} L${at(a, r - 6)} L${at(a + side, r * 0.28)} Z`}
              fill={areas.includes(area) ? tint.area(area).mark : color.paper}
              stroke={areas.includes(area) ? tint.area(area).mark : color.sand}
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          );
        })}
        <Circle cx={c} cy={c} r={4} fill={color.lantern} />
      </Svg>
    </View>
  );
}

type TitleProps = {
  children: ReactNode;
  /** A small trail-coloured icon beside the title, as a visual anchor. */
  icon?: IconName;
  /** A hand-drawn pencil underline: this section is something Kindway proposes. */
  pencil?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** A section heading: Literata title with an optional icon, never a kicker above it. */
export function SectionTitle({ children, icon, pencil, style }: TitleProps) {
  const styles = useStyles();
  const { color } = useTheme();
  return (
    <View style={style}>
      <View style={styles.row}>
        {icon && <MaterialCommunityIcons name={icon} size={20} color={color.trail} />}
        <Text variant="title" accessibilityRole="header" style={styles.title}>
          {children}
        </Text>
      </View>
      {pencil && (
        <Svg width={64} height={6} viewBox="0 0 64 6" style={styles.underline}>
          <Path d="M1 4 C 9 1, 15 5, 23 3 S 37 1, 45 3.5 S 57 4.5, 63 2" fill="none" stroke={color.pencil} strokeWidth={1.5} strokeLinecap="round" />
        </Svg>
      )}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  title: { flexShrink: 1 },
  underline: { marginTop: 2 },
}));
