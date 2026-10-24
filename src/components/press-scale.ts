import { useState } from 'react';
import type { ViewStyle } from 'react-native';
import { cubicBezier, useReducedMotion, type CSSStyle } from 'react-native-reanimated';

// Reanimated CSS transition styles (not a StyleSheet: the easing is a Reanimated object).
const rest: CSSStyle<ViewStyle> = {
  transform: [{ scale: 1 }],
  transitionProperty: 'transform',
  transitionDuration: 120,
  transitionTimingFunction: cubicBezier(0.23, 1, 0.32, 1),
};
const pressed: CSSStyle<ViewStyle> = { transform: [{ scale: 0.97 }] };

/**
 * Press feedback: a 3% scale-down in 120ms with a strong ease-out, run as a Reanimated CSS
 * transition (twice per press, never per frame). Put `style` on an Animated.View around the
 * pressable surface and spread `handlers` on the Pressable; Android ripples stay as they are.
 * Off under reduced motion.
 */
export function usePressScale() {
  const reduce = useReducedMotion();
  const [isPressed, setPressed] = useState(false);
  return {
    style: [rest, isPressed && !reduce && pressed],
    handlers: { onPressIn: () => setPressed(true), onPressOut: () => setPressed(false) },
  };
}
