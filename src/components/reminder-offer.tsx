import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { Button } from '@/components/button';
import { useSnackbar } from '@/components/feedback';
import { Notice } from '@/components/notice';
import { onWeb } from '@/services/platform';
import { useEntries, useStore } from '@/state/demo-store';
import { useAllowReminders } from '@/state/reminders';
import { makeStyles } from '@/theme/theme';
import { space } from '@/theme/tokens';

/**
 * Today's reminder offers, each shown at most once and only after the first entry:
 * - never asked: the evening reminder, switched on right here (Android asks next);
 * - blocked by Android: says why reminders can't arrive and opens system settings.
 * A "no" to either is final. Renders nothing otherwise, and nothing on the web.
 */
export function ReminderOffer() {
  const styles = useStyles();
  const { state, dispatch } = useStore();
  const entries = useEntries();
  const allow = useAllowReminders();
  const snack = useSnackbar();
  const [busy, setBusy] = useState(false);
  const r = state.reminders;
  const set = (patch: Partial<typeof r>) => dispatch({ type: 'reminders', patch });
  if (onWeb() || !state.onboarded || entries.length === 0) return null;

  if (r.permission === 'unasked' && !r.offered && !r.enabled) {
    const turnOn = async () => {
      setBusy(true);
      set({ offered: true });
      const permission = await allow({ enabled: true });
      setBusy(false);
      // A refusal at Android's prompt is an answer; the blocked card doesn't follow it.
      if (permission === 'granted') snack({ message: `Evening reminder set for ${r.time}.`, action: { label: 'Change', onPress: () => router.push('/settings/reminders') } });
      else set({ blockedOffered: true });
    };
    return (
      <View style={styles.wrap}>
        <Notice icon="bell-outline" title="Would a gentle nudge help?">
          One quiet reminder at {r.time}, with nothing from your entries. Skipping a day is always fine. Android will ask you to allow notifications.
        </Notice>
        <View style={styles.actions}>
          <Button variant="tonal" label="Turn on reminders" loading={busy} onPress={() => void turnOn()} />
          <Button variant="text" label="No thanks" onPress={() => set({ offered: true })} />
        </View>
      </View>
    );
  }

  if (r.permission === 'denied' && !r.blockedOffered) {
    return (
      <View style={styles.wrap}>
        <Notice icon="bell-off-outline" title="Reminders can’t reach you">
          Android is blocking Kindway’s notifications, so an evening reminder won’t arrive. You can allow them in Android settings, or leave them off. Writing works the same either way.
        </Notice>
        <View style={styles.actions}>
          <Button
            variant="tonal"
            label="Open Android settings"
            trailingIcon="arrow-right"
            onPress={() => {
              // Switched on now, so the reminder is scheduled as soon as Android allows it.
              set({ enabled: true, blockedOffered: true });
              void Linking.openSettings();
            }}
          />
          <Button variant="text" label="Leave them off" onPress={() => set({ blockedOffered: true })} />
        </View>
      </View>
    );
  }
  return null;
}

const useStyles = makeStyles(() => ({
  wrap: { marginBottom: space.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs, marginTop: space.xxs },
}));
