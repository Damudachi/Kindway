import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { Section, SwitchRow } from '@/components/controls';
import { Dialog, useSnackbar } from '@/components/feedback';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { EVENING_TEXT, isPaused, pauseUntil, TIMES, WEEKLY_TEXT } from '@/services/reminders';
import { useStore } from '@/state/demo-store';
import { useAllowReminders } from '@/state/reminders';
import { makeStyles, useTheme } from '@/theme/theme';
import { radius, space, touch } from '@/theme/tokens';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/**
 * Gentle reminders, as local notifications on this device. Opt-in; Android's permission prompt
 * comes only after the user turns one on and reads what it will do.
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
  const allow = useAllowReminders();
  const paused = isPaused(r);
  const until = paused && r.pausedUntil ? new Date(r.pausedUntil).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : null;

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
            <Button variant="text" label="Open system settings" onPress={() => void Linking.openSettings()} />
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
          <View style={styles.preview} accessibilityLabel={`Notification preview: Kindway. ${EVENING_TEXT}`}>
            <Text variant="labelSmall">Kindway · {r.time}</Text>
            <Text variant="body">{EVENING_TEXT}</Text>
          </View>
          {until && <Text variant="small">Paused until {until}. They start again on their own.</Text>}
          <Button
            variant="text"
            label={paused ? 'Resume reminders' : 'Pause for a week'}
            onPress={() => {
              const next = paused ? undefined : pauseUntil();
              set({ pausedUntil: next });
              snack({ message: next ? 'Paused for a week. Nothing is missed.' : 'Reminders resumed.' });
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
            <View style={styles.preview} accessibilityLabel={`Notification preview: Kindway. ${WEEKLY_TEXT}`}>
              <Text variant="labelSmall">
                Kindway · {DAYS[r.weeklyDay]} · {r.time}
              </Text>
              <Text variant="body">{WEEKLY_TEXT}</Text>
            </View>
          </>
        )}
      </Section>

      <Text variant="small">Reminders are scheduled on this phone only. Tapping one opens a new entry; the weekly one opens Patterns.</Text>

      <Dialog
        visible={asking !== null}
        title="Allow notifications?"
        body="Kindway will send one quiet reminder at the time you pick, without sound and without anything from your entries. Next, Android will ask for permission."
        confirmLabel="Continue"
        cancelLabel="Not now"
        onCancel={() => setAsking(null)}
        onConfirm={() => {
          const which = asking;
          setAsking(null);
          if (which) void allow({ [which]: true });
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
