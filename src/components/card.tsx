import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/text';
import { makeStyles, useTheme } from '@/theme/theme';
import { alpha, radius, space, touch } from '@/theme/tokens';

/**
 * A raised sheet of paper for one group that belongs together (Today's trail, a review, a list
 * of settings). By day a soft shadow lifts it; at night a lighter tone does. Cards never nest.
 */
export function Card({ children, style, flush }: { children: ReactNode; style?: StyleProp<ViewStyle>; flush?: boolean }) {
  const styles = useStyles();
  return <View style={[styles.card, flush && styles.flush, style]}>{children}</View>;
}

/** A way onward at the foot of a card: a full-width row under a sand rule, slate label, arrow at the edge. */
export function CardLink({ label, onPress }: { label: string; onPress: () => void }) {
  const styles = useStyles();
  const { color } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} android_ripple={{ color: alpha(color.trail, 0.1) }} style={styles.link}>
      <Text variant="label" style={styles.linkLabel}>
        {label}
      </Text>
      <MaterialCommunityIcons name="arrow-right" size={20} color={color.trail} />
    </Pressable>
  );
}

const useStyles = makeStyles((color) => ({
  card: {
    backgroundColor: color.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.cardEdge,
    boxShadow: color.cardShadow,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  // For rows that bring their own padding (settings lists).
  flush: { paddingVertical: space.xxs },
  link: {
    minHeight: touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: color.sand,
    // The row reaches the card's edges so its ripple does too; the label stays on the card's padding.
    marginHorizontal: -space.md,
    paddingHorizontal: space.md,
  },
  linkLabel: { flex: 1, color: color.trail },
}));
