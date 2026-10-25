import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useId, useState } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Mask, RadialGradient, Rect, Stop } from 'react-native-svg';

import { partOfDay } from '@/data/dates';
import { makeStyles, useTheme } from '@/theme/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * The Kindway mark, "Held light": an evening crescent cradling a small warm light. Same
 * geometry as the app icon (assets/brand/export-icons.mjs), on a 100-unit grid. `breathe`
 * lets the light glow softly in and out while the screen is in view (never under reduced motion).
 */
export function HeldLight({ size = 24, breathe = false }: { size?: number; breathe?: boolean }) {
  const { color } = useTheme();
  const id = useId().replace(/:/g, '');
  const reduce = useReducedMotion();
  // A breathing light stops while its screen is out of view.
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const glow = useSharedValue(0);

  useEffect(() => {
    if (!breathe || reduce || !focused) {
      glow.set(0);
      return;
    }
    glow.set(withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [breathe, reduce, focused, glow]);

  const halo = useAnimatedProps(() => ({ r: 11 + glow.get() * 4, opacity: 0.18 + glow.get() * 0.14 }));

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <Mask id={`held-${id}`}>
            <Rect width={100} height={100} fill="#fff" />
            <Circle cx={50} cy={38} r={27} fill="#000" />
          </Mask>
        </Defs>
        <Circle cx={50} cy={50} r={31} fill={color.ink} mask={`url(#held-${id})`} />
        {breathe && <AnimatedCircle cx={50} cy={56} fill={color.lantern} animatedProps={halo} />}
        <Circle cx={50} cy={56} r={8} fill={color.lantern} />
      </Svg>
    </View>
  );
}

/** Warmth of the light behind Today's greeting: pale and cool by day, lamp-lit at night. */
const GLOW = { morning: 0.16, afternoon: 0.2, evening: 0.34 } as const;

/**
 * A soft lamp-light wash behind Today's greeting, bleeding to the screen edges. It grows warmer
 * as the day goes on, so opening Kindway in the evening feels like arriving somewhere lit.
 * Decorative and behind everything; text contrast is checked against the paper, not the glow.
 */
export function EveningGlow() {
  const styles = useStyles();
  const { color, scheme } = useTheme();
  const id = useId().replace(/:/g, '');
  const part = partOfDay();
  const strength = GLOW[part] * (scheme === 'night' ? 0.8 : 1);
  return (
    <View style={styles.glow} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={`glow-${id}`} cx="84" cy="10" rx="80" ry="78" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={color.lantern} stopOpacity={strength} />
            <Stop offset="0.55" stopColor={color.lantern} stopOpacity={strength * 0.35} />
            <Stop offset="1" stopColor={color.lantern} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={100} height={100} fill={`url(#glow-${id})`} />
      </Svg>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  // From the top of the screen, under the status bar and the top app bar.
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 440 },
}));
