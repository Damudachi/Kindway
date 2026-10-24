import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme/theme';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/**
 * When the scheme changes, the old paper dissolves into the new one over 200ms instead of the
 * whole screen snapping. Rare (a setting or the evening switch), so it can afford the moment;
 * instant under reduced motion. Never takes touches.
 */
export function ThemeFade() {
  const { color } = useTheme();
  const reduce = useReducedMotion();
  const previous = useRef(color.paper);
  const fade = useSharedValue(0);
  const tone = useSharedValue(color.paper);

  useEffect(() => {
    if (previous.current === color.paper) return;
    if (!reduce) {
      tone.set(previous.current);
      fade.set(1);
      fade.set(withTiming(0, { duration: 200, easing: EASE_OUT }));
    }
    previous.current = color.paper;
  }, [color.paper, reduce, fade, tone]);

  const style = useAnimatedStyle(() => ({ opacity: fade.get(), backgroundColor: tone.get() }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]} />;
}
