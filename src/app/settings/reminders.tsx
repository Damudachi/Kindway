import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { Section, SwitchRow } from '@/components/controls';
import { Dialog, useSnackbar } from '@/components/feedback';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useStore } from '@/state/demo-store';
import { makeStyles, useTheme } from '@/theme/theme';
import { radius, space, touch } from '@/theme/tokens';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TIMES = ['8:00 PM', '9:00 PM', '10:00 PM'];

/**
 * Gentle reminders. Opt-in; permission is asked only after the user turns this on.
 * TODO(notifications): expo-notifications scheduling and the Android 13+ POST_NOTIFICATIONS request.
 */
export default function Reminders() {
  const styles = useStyles();
  const { color } = useTheme();
  const { state, dispatch } = useStore();
  const snack = useSnackbar();
  const r = state.reminders;
  // Which reminder is waiting on the permission prompt.
  const [asking, setAsking] = useState<'enabled' | 'weekly' | null>(null);
  const set = (patch: Partial<typeof r>) => dispatch({ type: 'reminders', patch });

  const toggle = (which: 'enabled' | 'weekly') => (on: boolean) => {
    if (on && r.permission !== 'granted') setAsking(which);
    else set({ [which]: on });
  };

  return (
    <Screen top={{ back: true, title: 'Gentle reminders' }}>
      <Text variant="headline" accessibilityRole="header">
        A nudge, only if it helps.
      </Text>
      <Text variant="bodyMuted" style={styles.lede}>
        You’re always free to skip a day. Reminders never mention your entries and never count anything.
      </Text>

      <Section first>
        <SwitchRow title="Evening reminder" detail={r.enabled ? `On · ${r.time}` : 'Off'} value={r.enabled} onChange={toggle('enabled')} />
        {r.permission === 'denied' && (
          <Notice tone="warn" title="Notifications are blocked">
            Android isn’t allowing Kindway to send notifications. You can change that in system settings, or skip reminders entirely.
          </Notice>
        )}
      </Section>

      <View style={!r.enabled && styles.dim} pointerEvents={r.enabled ? 'auto' : 'none'} importantForAccessibility={r.enabled ? 'auto' : 'no-hide-descendants'}>
        <Section title="Time">
          <ChipRow>
            {TIMES.map((t) => (
              <Chip key={t} label={t} selected={r.time === t} onPress={() => set({ time: t })} />
            ))}
          </ChipRow>
        </Section>
        <Section title="Days">
          <View style={styles.days}>
            {DAYS.map((d, i) => (
              <Pressable
                key={d}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: r.days[i] }}
                accessibilityLabel={d}
                onPress={() => set({ days: r.days.map((v, j) => (j === i ? !v : v)) })}
                style={[styles.day, r.days[i] && styles.dayOn]}>
                <Text variant="label" style={{ color: r.days[i] ? color.onTrailContainer : color.ink }}>
                  {d[0]}
                </Text>
              </Pressable>
            ))}
          </View>
        </Section>
        <Section title="Preview">
          <View style={styles.preview} accessibilityLabel="Notification preview: Kindway. A moment for yourself is here when you need it.">
            <Text variant="labelSmall">Kindway · {r.time}</Text>
            <Text variant="body">A moment for yourself is here when you need it.</Text>
          </View>
          <Button
            variant="text"
            label={r.pausedUntil ? 'Resume reminders' : 'Pause for a week'}
            onPress={() => {
              set({ pausedUntil: r.pausedUntil ? undefined : 'Oct 24' });
              snack({ message: r.pausedUntil ? 'Reminders resumed.' : 'Paused until Oct 24. Nothing is missed.' });
            }}
          />
        </Section>
      </View>
      <Section title="Weekly look-back">
        <SwitchRow
          title="Remind me to look back on my week"
          detail={r.weekly ? `On · ${DAYS[r.weeklyDay]} evenings` : 'Off. Patterns are always there when you open them.'}
          value={r.weekly}
          onChange={toggle('weekly')}
        />
        {r.weekly && (
          <>
            <ChipRow>
              {DAYS.map((d, i) => (
                <Chip key={d} label={d.slice(0, 3)} selected={r.weeklyDay === i} onPress={() => set({ weeklyDay: i })} />
              ))}
            </ChipRow>
            <View style={styles.preview} accessibilityLabel="Notification preview: Kindway. Your week is here to look back on, whenever you like.">
              <Text variant="labelSmall">Kindway · {DAYS[r.weeklyDay]}</Text>
              <Text variant="body">Your week is here to look back on, whenever you like.</Text>
            </View>
          </>
        )}
      </Section>

      <Notice tone="demo">Reminders aren’t scheduled in this demo. No notifications will appear.</Notice>

      <Dialog
        visible={asking !== null}
        title="Allow notifications?"
        body="Kindway will send one quiet reminder at the time you pick. Next, Android will ask for permission (simulated here)."
        confirmLabel="Allow"
        cancelLabel="Don't allow"
        onCancel={() => {
          setAsking(null);
          set({ permission: 'denied', enabled: false, weekly: false });
        }}
        onConfirm={() => {
          if (asking) set({ permission: 'granted', [asking]: true });
          setAsking(null);
        }}
      />
    </Screen>
  );
}

const useStyles = makeStyles((color) => ({
  lede: { marginTop: space.xs },
  dim: { opacity: 0.45 },
  days: { flexDirection: 'row', justifyContent: 'space-between' },
  day: {
    width: touch,
    height: touch,
    borderRadius: touch / 2,
    borderWidth: 1,
    borderColor: color.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayOn: { backgroundColor: color.trailContainer, borderColor: color.trailContainer },
  preview: { padding: space.md, borderRadius: radius.lg, backgroundColor: color.raised, borderWidth: 1, borderColor: color.sand, gap: 2 },
}));
