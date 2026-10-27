import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ReactNode, Ref } from 'react';
import { Pressable, Switch, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';

import { Text } from '@/components/text';
import { makeStyles, useTheme } from '@/theme/theme';
import { alpha, radius, space, touch } from '@/theme/tokens';

type RadioRowProps = { title: string; detail?: string; selected: boolean; onPress: () => void };

/** Full-width single-choice row with a Material radio. */
export function RadioRow({ title, detail, selected, onPress }: RadioRowProps) {
  const styles = useStyles();
  const { color } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={detail ? `${title}. ${detail}` : title}
      onPress={onPress}
      android_ripple={{ color: alpha(color.ink, 0.06) }}
      style={[styles.choice, selected && styles.choiceSelected]}>
      <View style={[styles.radio, selected && styles.radioOn]}>{selected && <View style={styles.radioDot} />}</View>
      <View style={styles.flex}>
        <Text variant="label" style={{ fontSize: 16, lineHeight: 24 }}>
          {title}
        </Text>
        {detail && <Text variant="small">{detail}</Text>}
      </View>
    </Pressable>
  );
}

type SwitchRowProps = { title: string; detail?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean };

export function SwitchRow({ title, detail, value, onChange, disabled }: SwitchRowProps) {
  const styles = useStyles();
  const { color } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={detail ? `${title}. ${detail}` : title}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={styles.switchRow}>
      <View style={styles.flex}>
        <Text variant="body">{title}</Text>
        {detail && <Text variant="small">{detail}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        importantForAccessibility="no"
        trackColor={{ false: color.sand, true: color.trail }}
        // Material 3: an outline-coloured thumb when off keeps the control visible on either paper.
        thumbColor={value ? color.raised : color.outline}
      />
    </Pressable>
  );
}

type CheckRowProps = { label: string; checked: boolean; onChange: (v: boolean) => void };

export function CheckRow({ label, checked, onChange }: CheckRowProps) {
  const styles = useStyles();
  const { color } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={() => onChange(!checked)}
      style={styles.checkRow}>
      <MaterialCommunityIcons
        name={checked ? 'checkbox-marked' : 'checkbox-blank-outline'}
        size={24}
        color={checked ? color.trail : color.outline}
      />
      <Text variant="body" style={styles.flex}>
        {label}
      </Text>
    </Pressable>
  );
}

type Option<T extends string> = { id: T; label: string };

/** Material segmented button. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const styles = useStyles();
  const { color } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.segmented}>
      {options.map((o, i) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.id)}
            style={[styles.segment, i > 0 && styles.segmentDivider, on && styles.segmentOn]}>
            {on && <MaterialCommunityIcons name="check" size={16} color={color.onTrailContainer} />}
            <Text variant="label" numberOfLines={1} style={{ color: on ? color.onTrailContainer : color.ink }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type FieldProps = TextInputProps & { label: string; error?: string; helper?: string; ref?: Ref<TextInputInstance> };

/** Outlined text field with a persistent label (not placeholder-only). */
export function Field({ label, error, helper, style, ref, ...rest }: FieldProps) {
  const styles = useStyles();
  const { color } = useTheme();
  return (
    <View style={styles.field}>
      <Text variant="label" style={styles.fieldLabel} nativeID={`${label}-label`}>
        {label}
      </Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={error ?? helper}
        placeholderTextColor={color.pencil}
        cursorColor={color.trail}
        selectionColor={color.trailContainer}
        style={[styles.input, !!error && styles.inputError, style]}
        {...rest}
      />
      {error ? (
        <Text variant="small" style={{ color: color.danger }} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : helper ? (
        <Text variant="small">{helper}</Text>
      ) : null}
    </View>
  );
}

/** A titled group separated by the single hairline rule. */
export function Section({ title, children, first }: { title?: string; children: ReactNode; first?: boolean }) {
  const styles = useStyles();
  return (
    <View style={[styles.section, !first && styles.sectionRule]}>
      {title && (
        <Text variant="title" accessibilityRole="header" style={styles.sectionTitle}>
          {title}
        </Text>
      )}
      {children}
    </View>
  );
}

type NavRowProps = { title: string; detail?: string; onPress: () => void; icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'] };

export function NavRow({ title, detail, onPress, icon }: NavRowProps) {
  const styles = useStyles();
  const { color } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${title}. ${detail}` : title}
      onPress={onPress}
      android_ripple={{ color: alpha(color.ink, 0.06) }}
      style={styles.navRow}>
      {icon && (
        <View style={styles.navIcon}>
          <MaterialCommunityIcons name={icon} size={20} color={color.onTrailContainer} />
        </View>
      )}
      <View style={styles.flex}>
        <Text variant="body">{title}</Text>
        {detail && <Text variant="small">{detail}</Text>}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={24} color={color.inkMuted} />
    </Pressable>
  );
}

const useStyles = makeStyles((color, type) => ({
  flex: { flex: 1, minWidth: 0 },
  choice: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.sand,
    backgroundColor: color.raised,
    marginBottom: space.xs,
    overflow: 'hidden',
  },
  choiceSelected: { borderColor: color.trail, backgroundColor: color.trailContainer },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: color.outline,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: color.trail },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.trail },
  switchRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  checkRow: { minHeight: touch, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs },
  segmented: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: color.outline,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  segment: { flex: 1, minHeight: touch, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xs },
  segmentDivider: { borderLeftWidth: 1, borderLeftColor: color.outline },
  segmentOn: { backgroundColor: color.trailContainer },
  field: { gap: 6, marginBottom: space.md },
  fieldLabel: { color: color.inkMuted },
  input: {
    ...type.body,
    minHeight: 56,
    borderWidth: 1,
    borderColor: color.outline,
    borderRadius: radius.md,
    backgroundColor: color.raised,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  inputError: { borderColor: color.danger, borderWidth: 2 },
  section: { paddingVertical: space.lg },
  sectionRule: { borderTopWidth: 1, borderTopColor: color.sand },
  sectionTitle: { marginBottom: space.sm },
  navRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  navIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: color.trailContainer },
}));
