import { useEffect, useRef } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { Text } from '@/components/text';
import { Blaze } from '@/components/trail';
import { countLine, MILESTONE_COPY, type Milestone } from '@/state/trail-progress';
import { makeStyles, useTheme } from '@/theme/theme';
import { alpha, motion, space } from '@/theme/tokens';

export type TrailMomentInfo = { entryId: string; count: number; milestone?: Milestone };

const SHOWN = 1500;
const SHOWN_MILESTONE = 2500;

type Props = {
  moment: TrailMomentInfo;
  onDone: () => void;
  /** Paint the blaze (with its single light haptic). Off where the screen behind already paints it. */
  paint?: boolean;
};

/**
 * The lighting moment after a new entry is saved: a soft lantern glow, the blaze, one warm line.
 * Tap anywhere to skip; otherwise it dismisses itself. Reduced motion drops the glow and scale.
 */
export function TrailMoment({ moment, onDone, paint }: Props) {
  const styles = useStyles();
  const { color } = useTheme();
  const reduce = useReducedMotion();
  const line = moment.milestone ? MILESTONE_COPY[moment.milestone].line : countLine(moment.count);
  const glow = useSharedValue(reduce ? 1 : 0);

  // Leaving mid-moment (back, another tab) counts as done, so it never resurfaces later.
  const done = useRef(false);
  const finish = useRef(onDone);
  useEffect(() => {
    finish.current = onDone;
  });
  const end = () => {
    if (done.current) return;
    done.current = true;
    finish.current();
  };

  useEffect(() => {
    if (!reduce) glow.set(withTiming(1, { duration: motion.long * 2, easing: Easing.out(Easing.exp) }));
    const t = setTimeout(end, moment.milestone ? SHOWN_MILESTONE : SHOWN);
    return () => {
      clearTimeout(t);
      end();
    };
    // Once per moment; a re-render must not restart the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.get(), transform: [{ scale: 0.9 + 0.1 * glow.get() }] }));

  return (
    <Animated.View entering={reduce ? undefined : FadeIn.duration(motion.medium)} exiting={reduce ? undefined : FadeOut.duration(motion.short)} style={styles.fill}>
      <Pressable accessibilityRole="button" accessibilityLabel="Skip" onPress={end} style={styles.fill}>
        <View style={styles.centre}>
          {!reduce && <Animated.View testID="trail-moment-glow" style={[styles.glow, { backgroundColor: alpha(color.lantern, 0.22) }, glowStyle]} />}
          <Blaze paint={paint} />
          <Text variant="title" accessibilityLiveRegion="polite" style={styles.line}>
            {line}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles((color) => ({
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: alpha(color.paper, 0.94) },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, paddingHorizontal: space.lg },
  glow: { position: 'absolute', width: 220, height: 220, borderRadius: 110 },
  line: { textAlign: 'center' },
}));
