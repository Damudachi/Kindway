import { Children, useEffect, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path, Rect } from 'react-native-svg';

import { makeStyles, useTheme } from '@/theme/theme';
import { alpha, motion, space } from '@/theme/tokens';

export type BlazeState = 'painted' | 'open' | 'next' | 'tentative';

/** Exactly two sizes, so emphasis never inflates. */
const SIZE = { mark: { w: 6, h: 16 }, small: { w: 4, h: 10 } };

type BlazeProps = {
  state?: BlazeState;
  size?: keyof typeof SIZE;
  paint?: boolean;
  onPainted?: () => void;
  /** Paint colour of a painted blaze, e.g. the entry's first feeling. Defaults to the trail. */
  tint?: string;
};

/**
 * The signature mark: a painted trail blaze.
 * `paint` plays the fill from bottom to top once (instant under reduced motion).
 */
export function Blaze({ state = 'painted', size = 'mark', paint, onPainted, tint }: BlazeProps) {
  const styles = useStyles();
  const { color } = useTheme();
  const { w, h } = SIZE[size];
  const reduce = useReducedMotion();
  const fill = useSharedValue(paint ? 0 : 1);

  useEffect(() => {
    if (!paint) return;
    if (reduce) {
      fill.set(1);
      onPainted?.();
      return;
    }
    // From empty, even when this blaze was already showing (a step blaze turning from next to done).
    fill.set(0);
    fill.set(withTiming(1, { duration: motion.medium, easing: Easing.out(Easing.exp) }));
    const t = setTimeout(() => onPainted?.(), motion.medium + 60);
    return () => clearTimeout(t);
  }, [paint, reduce, fill, onPainted]);

  // Scaled from the bottom edge rather than grown in height, so it never re-runs layout.
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: fill.get() }] }));

  if (state !== 'painted') {
    const stroke = state === 'next' ? color.lichen : state === 'tentative' ? color.pencil : color.lantern;
    // Drawn inside the same footprint as a painted blaze; tonight's open blaze is a dashed lantern stroke, waiting to be painted.
    return (
      <Svg width={w} height={h} style={styles.outline}>
        <Rect
          x={1}
          y={1}
          width={w - 2}
          height={h - 2}
          rx={0.5}
          fill={color.paper}
          stroke={stroke}
          strokeWidth={2}
          strokeDasharray={state === 'open' ? '3 2' : undefined}
        />
      </Svg>
    );
  }
  return (
    <View style={[styles.blazeBox, { width: w, height: h }]}>
      <Animated.View style={[styles.fill, { width: w, height: h }, tint && { backgroundColor: tint }, fillStyle]} />
    </View>
  );
}

type StopProps = {
  blaze: BlazeState;
  /** Paint colour of a painted blaze. */
  tint?: string;
  paint?: boolean;
  onPainted?: () => void;
  onPress?: () => void;
  accessibilityLabel?: string;
  last?: boolean;
  children: ReactNode;
};

/** One stop on the trail: blaze on the line, content beside it. */
export function TrailStop({ blaze, tint, paint, onPainted, onPress, accessibilityLabel, last, children }: StopProps) {
  const styles = useStyles();
  const { color } = useTheme();
  const content = (
    <View style={styles.stop}>
      <View style={styles.marker}>
        <Blaze state={blaze} tint={tint} paint={paint} onPainted={onPainted} />
      </View>
      <View style={[styles.stopBody, !last && styles.rule]}>{children}</View>
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      android_ripple={{ color: alpha(color.ink, 0.06) }}>
      {content}
    </Pressable>
  );
}

// The line's centre and the blaze column's centre coincide at 11dp.
const LINE_X = 10;
const MARKER_W = 22;
const CENTRE = LINE_X + 1;
// Where a stop's blaze sits: the marker's top padding plus half a mark blaze.
const BLAZE_Y = space.sm + 4 + SIZE.mark.h / 2;
// How far the path swings off the blaze column between stops; it stays inside the marker column.
const SWING = 6;

/**
 * A gently winding path through each stop's blaze: straight through every blaze, swinging
 * alternately left and right between them, like a footpath between painted trees.
 */
export function trailPath(stops: number[], height: number) {
  const ys = [0, ...stops, height];
  let d = `M${CENTRE} 0`;
  for (let i = 1; i < ys.length; i++) {
    const [y0, y1] = [ys[i - 1], ys[i]];
    const x = CENTRE + (i % 2 ? SWING : -SWING);
    d += ` C${x} ${y0 + (y1 - y0) / 3} ${x} ${y0 + ((y1 - y0) * 2) / 3} ${CENTRE} ${y1}`;
  }
  return d;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** Draw-ins already played this session, so revisiting a tab doesn't replay them. */
const drawn = new Set<string>();

type TrailProps = {
  children: ReactNode;
  /**
   * The path draws itself in (about 600ms) once per distinct key: e.g. once a day on Today,
   * and again when an entry is saved, as the trail extends to the new blaze.
   */
  drawKey?: string;
  /** Stops fade up one after another on the list's first render only. */
  stagger?: boolean;
};

/**
 * The trail: one slate path threading its stops. Each stop is measured, so the path follows
 * the real layout at any font size; until then it's a straight line.
 */
export function Trail({ children, drawKey, stagger }: TrailProps) {
  const styles = useStyles();
  const { color } = useTheme();
  const reduce = useReducedMotion();
  const items = Children.toArray(children);
  const [height, setHeight] = useState(0);
  const [tops, setTops] = useState<Record<number, number>>({});
  const [entering, setEntering] = useState(!!stagger);
  const stops = items.map((_, i) => tops[i]).filter((y): y is number => y !== undefined);
  const measured = height > 0 && stops.length === items.length;
  const measure = (i: number, y: number) => setTops((t) => (t[i] === y ? t : { ...t, [i]: y }));

  // A little longer than the path (its swings add a few percent), so the dash covers it all.
  const length = height * 1.1 + 24;
  const progress = useSharedValue(1);
  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - progress.get()) }));

  useEffect(() => {
    if (!measured || !drawKey || drawn.has(drawKey)) return;
    drawn.add(drawKey);
    if (reduce) return;
    progress.set(0);
    progress.set(withTiming(1, { duration: 600, easing: EASE_OUT }));
  }, [measured, drawKey, reduce, progress]);

  // Later additions (a cleared filter, a new entry) appear without the entrance.
  useEffect(() => {
    const t = setTimeout(() => setEntering(false));
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={styles.trail} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      {measured ? (
        <Svg width={MARKER_W} height={height} style={styles.path} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <AnimatedPath
            d={trailPath(stops.map((y) => y + BLAZE_Y), height)}
            fill="none"
            stroke={color.trail}
            strokeOpacity={0.45}
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray={[length, length]}
            animatedProps={lineProps}
          />
        </Svg>
      ) : (
        <View style={styles.line} />
      )}
      {items.map((child, i) => (
        <Animated.View key={i} entering={entering ? FadeInDown.duration(250).delay(i * 40) : undefined} onLayout={(e) => measure(i, e.nativeEvent.layout.y)}>
          {child}
        </Animated.View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((color) => ({
  outline: { backgroundColor: color.paper },
  blazeBox: { justifyContent: 'flex-end', borderRadius: 1, overflow: 'hidden', backgroundColor: 'transparent' },
  fill: { backgroundColor: color.trail, transformOrigin: 'bottom' },
  trail: { position: 'relative' },
  path: { position: 'absolute', left: 0, top: 0 },
  line: { position: 'absolute', left: LINE_X, top: 0, bottom: 0, width: 2, backgroundColor: color.trail, opacity: 0.45 },
  stop: { flexDirection: 'row', gap: space.sm, minHeight: 64 },
  marker: { width: MARKER_W, paddingTop: space.sm + 4, alignItems: 'center' },
  stopBody: { flex: 1, minWidth: 0, paddingVertical: space.sm },
  rule: { borderBottomWidth: 1, borderBottomColor: color.sand },
}));
