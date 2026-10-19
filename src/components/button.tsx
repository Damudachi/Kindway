import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/text';
import { color, radius, space, touch } from '@/theme/tokens';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

type Variant = 'primary' | 'secondary' | 'text' | 'danger' | 'dangerText';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: IconName;
  trailingIcon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, onPress, variant = 'primary', icon, trailingIcon, disabled, loading, accessibilityHint, style }: Props) {
  const v = variants[variant];
  const fg = disabled ? color.inkMuted : v.fg;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      android_ripple={{ color: v.ripple, foreground: true }}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.tall,
        { backgroundColor: disabled && v.bg !== 'transparent' ? color.sunk : v.bg, borderColor: v.border },
        (variant === 'text' || variant === 'dangerText') && styles.textOnly,
        pressed && styles.pressed,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={[styles.row, trailingIcon && styles.spread]}>
          {icon && <MaterialCommunityIcons name={icon} size={20} color={fg} />}
          <Text variant="label" style={{ color: fg, fontSize: variant === 'primary' ? 16 : 14 }}>
            {label}
          </Text>
          {trailingIcon && <MaterialCommunityIcons name={trailingIcon} size={20} color={fg} />}
        </View>
      )}
    </Pressable>
  );
}

const variants: Record<Variant, { bg: string; fg: string; border: string; ripple: string }> = {
  primary: { bg: color.ink, fg: color.onInk, border: color.ink, ripple: 'rgba(248,247,243,0.18)' },
  secondary: { bg: 'transparent', fg: color.ink, border: color.outline, ripple: 'rgba(37,39,43,0.08)' },
  text: { bg: 'transparent', fg: color.trail, border: 'transparent', ripple: 'rgba(77,100,116,0.12)' },
  danger: { bg: color.danger, fg: color.onInk, border: color.danger, ripple: 'rgba(248,247,243,0.18)' },
  dangerText: { bg: 'transparent', fg: color.danger, border: 'transparent', ripple: 'rgba(154,59,46,0.12)' },
};

type IconButtonProps = { icon: IconName; label: string; onPress?: () => void; tint?: string };

/** 48dp icon button, Material standard. */
export function IconButton({ icon, label, onPress, tint = color.inkMuted }: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      android_ripple={{ color: 'rgba(37,39,43,0.1)', borderless: true, radius: 24 }}
      style={styles.icon}>
      <MaterialCommunityIcons name={icon} size={24} color={tint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touch,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: space.gutter,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tall: { minHeight: 56 },
  // Text buttons keep their touch padding but align the label with the content column.
  textOnly: { paddingHorizontal: space.sm, marginLeft: -space.sm, alignSelf: 'flex-start' },
  pressed: { opacity: 0.92 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs },
  spread: { justifyContent: 'space-between' },
  icon: { width: touch, height: touch, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
});
