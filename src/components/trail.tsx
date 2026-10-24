import { useEffect, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';

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
      fill.value = 1;
      onPainted?.();
      return;
    }
    fill.value = withTiming(1, { duration: motion.medium, easing: Easing.out(Easing.exp) });
    const t = setTimeout(() => onPainted?.(), motion.medium + 60);
    return () => clearTimeout(t);
  }, [paint, reduce, fill, onPainted]);

  const fillStyle = useAnimatedStyle(() => ({ height: fill.value * h }));

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
      <Animated.View style={[styles.fill, { width: w }, tint && { backgroundColor: tint }, fillStyle]} />
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

/** The trail: a single slate line threading its stops. */
export function Trail({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.trail}>
      <View style={styles.line} />
      {children}
    </View>
  );
}

// The line's centre and the blaze column's centre coincide at 11dp.
const LINE_X = 10;
const MARKER_W = 22;

const useStyles = makeStyles((color) => ({
  outline: { backgroundColor: color.paper },
  blazeBox: { justifyContent: 'flex-end', borderRadius: 1, overflow: 'hidden', backgroundColor: 'transparent' },
  fill: { backgroundColor: color.trail },
  trail: { position: 'relative' },
  line: { position: 'absolute', left: LINE_X, top: 0, bottom: 0, width: 2, backgroundColor: color.trail, opacity: 0.45 },
  stop: { flexDirection: 'row', gap: space.sm, minHeight: 64 },
  marker: { width: MARKER_W, paddingTop: space.sm + 4, alignItems: 'center' },
  stopBody: { flex: 1, minWidth: 0, paddingVertical: space.sm },
  rule: { borderBottomWidth: 1, borderBottomColor: color.sand },
}));
