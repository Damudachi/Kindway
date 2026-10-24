import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { IconName } from '@/components/button';
import { Text } from '@/components/text';
import { makeStyles, useTheme } from '@/theme/theme';
import { radius, space, type Palette } from '@/theme/tokens';

type Tone = 'demo' | 'info' | 'warn';

/**
 * Inline notice. `demo` marks anything simulated in this milestone
 * (AI, sync, export, deletion, voice, widget) so nothing pretends to be connected.
 */
export function Notice({ tone = 'info', title, children, icon }: { tone?: Tone; title?: string; children: ReactNode; icon?: IconName }) {
  const styles = useStyles();
  const { color } = useTheme();
  const t = tones(color)[tone];
  return (
    <View style={[styles.box, { backgroundColor: t.bg, borderColor: t.border }]} accessibilityRole="text">
      <MaterialCommunityIcons name={icon ?? t.icon} size={20} color={t.fg} style={styles.icon} />
      <View style={styles.flex}>
        {title && (
          <Text variant="label" style={{ color: t.fg }}>
            {title}
          </Text>
        )}
        <Text variant="small" style={{ color: t.fg }}>
          {children}
        </Text>
      </View>
    </View>
  );
}

const tones = (color: Palette): Record<Tone, { bg: string; fg: string; border: string; icon: IconName }> => ({
  demo: { bg: color.sunk, fg: color.inkMuted, border: color.sand, icon: 'flask-outline' },
  info: { bg: color.trailContainer, fg: color.onTrailContainer, border: color.trailContainer, icon: 'information-outline' },
  warn: { bg: color.dangerContainer, fg: color.danger, border: color.dangerContainer, icon: 'alert-circle-outline' },
});

/** Calm empty/error state: words first, one action. */
export function StateView({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.state}>
      <Text variant="headline" accessibilityRole="header" style={{ fontSize: 22, lineHeight: 30 }}>
        {title}
      </Text>
      <Text variant="bodyMuted">{body}</Text>
      {action}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  box: { flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1 },
  icon: { marginTop: 1 },
  flex: { flex: 1, gap: 2 },
  state: { paddingVertical: space.xl, gap: space.sm },
}));
