import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, View } from 'react-native';

import type { IconName } from '@/components/button';
import { Text } from '@/components/text';
import { makeStyles, useTheme } from '@/theme/theme';
import { radius, space, touch, type Tint } from '@/theme/tokens';

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  disabled?: boolean;
  /** 'filter' chips toggle; 'assist' chips act. */
  kind?: 'filter' | 'assist';
  /** A filter chip's own hue when selected (feelings); the trail's otherwise. */
  tint?: Tint;
};

export function Chip({ label, selected = false, onPress, icon, disabled, kind = 'filter', tint }: Props) {
  const styles = useStyles();
  const { color } = useTheme();
  const on = tint?.on ?? color.onTrailContainer;
  return (
    <Pressable
      accessibilityRole={kind === 'filter' ? 'checkbox' : 'button'}
      accessibilityState={kind === 'filter' ? { checked: selected, disabled } : { disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      // 32dp visual chip inside a 48dp touch target.
      style={styles.target}>
      <View style={[styles.chip, selected && styles.selected, selected && tint && { backgroundColor: tint.container, borderColor: tint.container }, disabled && styles.disabled]}>
        {selected && kind === 'filter' ? (
          <MaterialCommunityIcons name="check" size={18} color={on} />
        ) : icon ? (
          <MaterialCommunityIcons name={icon} size={18} color={color.ink} />
        ) : null}
        <Text variant="label" style={[styles.label, { color: selected ? on : color.ink }]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <View style={styles.row}>{children}</View>;
}

const useStyles = makeStyles((color) => ({
  target: { minHeight: touch, justifyContent: 'center', maxWidth: '100%' },
  label: { flexShrink: 1 },
  chip: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.outline,
    paddingVertical: 6,
  },
  selected: { backgroundColor: color.trailContainer, borderColor: color.trailContainer },
  disabled: { opacity: 0.45 },
  row: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.xs },
}));
