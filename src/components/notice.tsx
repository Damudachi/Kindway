import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { IconName } from '@/components/button';
import { Illustration, type ArtName } from '@/components/illustrations';
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
    <View style={[styles.box, { backgroundColor: t.bg }]} accessibilityRole="text">
      <MaterialCommunityIcons name={icon ?? t.icon} size={20} color={t.mark} style={styles.icon} />
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

// A soft fill in the role's colour, with the icon in the role's own ink.
const tones = (color: Palette): Record<Tone, { bg: string; fg: string; mark: string; icon: IconName }> => ({
  demo: { bg: color.lanternContainer, fg: color.onLanternContainer, mark: color.lanternInk, icon: 'flask-outline' },
  info: { bg: color.trailContainer, fg: color.onTrailContainer, mark: color.trail, icon: 'information-outline' },
  warn: { bg: color.dangerContainer, fg: color.danger, mark: color.danger, icon: 'alert-circle-outline' },
});

/** Calm empty/error state: words first, one action; empty states can carry a small line drawing. */
export function StateView({ title, body, action, art }: { title: string; body: string; action?: ReactNode; art?: ArtName }) {
  const styles = useStyles();
  return (
    <View style={styles.state}>
      {art && <Illustration name={art} />}
      <Text variant="headline" accessibilityRole="header" style={{ fontSize: 22, lineHeight: 30 }}>
        {title}
      </Text>
      <Text variant="bodyMuted">{body}</Text>
      {action}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  box: { flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.md },
  icon: { marginTop: 1 },
  flex: { flex: 1, gap: 2 },
  state: { paddingVertical: space.xl, gap: space.sm },
}));
