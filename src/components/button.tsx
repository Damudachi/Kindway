import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePressScale } from '@/components/press-scale';
import { Text } from '@/components/text';
import { makeStyles, useTheme } from '@/theme/theme';
import { alpha, radius, space, touch, type Palette } from '@/theme/tokens';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * - primary: the screen's main act, full width.
 * - tonal: a slate-wash pill for a supporting action or a way onward; hugs its label.
 * - secondary: outlined, for an equal alternative to the primary.
 * - text: dismiss, cancel and other quiet choices beside a stronger action.
 */
type Variant = 'primary' | 'tonal' | 'secondary' | 'text' | 'danger' | 'dangerText';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: IconName;
  trailingIcon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  /** Primary only: the icons take the lantern accent (Write, Talk). */
  accent?: boolean;
  /** Primary and danger at the 48dp height with a 14sp label, for dialogs and inline actions. */
  compact?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, onPress, variant = 'primary', icon, trailingIcon, disabled, loading, accent, compact, accessibilityHint, style }: Props) {
  const styles = useStyles();
  const { color } = useTheme();
  const v = variants(color)[variant];
  // Disabled text buttons fade to 38% ink (Material's disabled content), so they never read as
  // an enabled action beside one; disabled filled buttons keep Muted Ink on Sunk.
  const fg = !disabled ? v.fg : v.bg === 'transparent' && v.border === 'transparent' ? alpha(color.ink, 0.38) : color.inkMuted;
  const iconColor = accent && variant === 'primary' && !disabled ? color.primaryAccent : fg;
  const press = usePressScale();
  const textOnly = variant === 'text' || variant === 'dangerText';
  return (
    // Layout (the caller's style, the text button's gutter offset) sits on the scaling wrapper.
    <Animated.View style={[press.style, textOnly && styles.textOuter, variant === 'tonal' && styles.hug, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: !!disabled, busy: !!loading }}
        disabled={disabled || loading}
        onPress={onPress}
        {...press.handlers}
        android_ripple={{ color: v.ripple, foreground: true }}
        style={({ pressed }) => [
          styles.base,
          variant === 'primary' && !compact && styles.tall,
          disabled && v.bg !== 'transparent' ? { backgroundColor: color.sunk, borderColor: color.sand } : { backgroundColor: v.bg, borderColor: v.border },
          textOnly && styles.textOnly,
          variant === 'tonal' && styles.tonal,
          pressed && styles.pressed,
        ]}>
        {loading ? (
          <ActivityIndicator color={fg} />
        ) : (
          <View style={[styles.row, trailingIcon && styles.spread]}>
            {/* The leading icon stays with its label; a trailing icon sits at the far edge. */}
            <View style={[styles.row, styles.lead]}>
              {icon && <MaterialCommunityIcons name={icon} size={20} color={iconColor} />}
              <Text variant="label" style={[styles.label, textOnly && styles.labelStart, { color: fg, fontSize: variant === 'primary' && !compact ? 16 : 14 }]}>
                {label}
              </Text>
            </View>
            {trailingIcon && <MaterialCommunityIcons name={trailingIcon} size={20} color={iconColor} />}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const variants = (color: Palette): Record<Variant, { bg: string; fg: string; border: string; ripple: string }> => ({
  primary: { bg: color.primary, fg: color.onPrimary, border: color.primary, ripple: alpha(color.onPrimary, 0.18) },
  tonal: { bg: color.trailContainer, fg: color.onTrailContainer, border: color.trailContainer, ripple: alpha(color.onTrailContainer, 0.12) },
  secondary: { bg: 'transparent', fg: color.ink, border: color.outline, ripple: alpha(color.ink, 0.08) },
  text: { bg: 'transparent', fg: color.trail, border: 'transparent', ripple: alpha(color.trail, 0.12) },
  danger: { bg: color.danger, fg: color.onInk, border: color.danger, ripple: alpha(color.onInk, 0.18) },
  dangerText: { bg: 'transparent', fg: color.danger, border: 'transparent', ripple: alpha(color.danger, 0.12) },
});

type IconButtonProps = { icon: IconName; label: string; onPress?: () => void; tint?: string; selected?: boolean; keepFocus?: boolean; disabled?: boolean };

// react-native-web forwards onMouseDown to the DOM; the native types don't know it.
const webKeepFocus = { onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault() } as object;

/** 48dp icon button, Material standard. `selected` marks a toggle; `keepFocus` stops a click taking focus off a text field (web). */
export function IconButton({ icon, label, onPress, tint, selected, keepFocus, disabled }: IconButtonProps) {
  const styles = useStyles();
  const { color } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined && !disabled ? undefined : { selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      {...(keepFocus ? webKeepFocus : null)}
      hitSlop={4}
      android_ripple={{ color: alpha(color.ink, 0.1), borderless: true, radius: 24 }}
      style={[styles.icon, disabled && styles.iconOff]}>
      <MaterialCommunityIcons name={icon} size={24} color={tint ?? color.inkMuted} />
    </Pressable>
  );
}

const useStyles = makeStyles(() => ({
  base: {
    minHeight: touch,
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: space.gutter,
    // A long label wraps onto more lines and the button grows; short ones keep the touch height.
    paddingVertical: space.xs,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tall: { minHeight: 56 },
  // Text buttons keep their touch padding but align the label with the content column.
  textOnly: { paddingHorizontal: space.sm },
  textOuter: { marginLeft: -space.sm, alignSelf: 'flex-start' },
  tonal: { paddingHorizontal: space.md + 2 },
  hug: { alignSelf: 'flex-start', marginVertical: space.xxs },
  pressed: { opacity: 0.92 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs },
  // In a row a label doesn't shrink by default, so a long one ran past the edge and was clipped.
  label: { flexShrink: 1, textAlign: 'center' },
  // A text button is a link in the content column: when it wraps, its lines start at the gutter.
  labelStart: { textAlign: 'left' },
  spread: { justifyContent: 'space-between' },
  lead: { flexShrink: 1 },
  iconOff: { opacity: 0.38 },
  icon: { width: touch, height: touch, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
}));
