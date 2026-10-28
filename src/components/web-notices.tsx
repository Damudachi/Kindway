import { router } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { now, nowIso } from '@/data/dates';
import { inIosBrowserTab, onWeb } from '@/services/platform';
import { useEntries } from '@/state/demo-store';
import { useSession } from '@/state/session';
import { useWebPrefs } from '@/state/web-prefs';
import { useUpdateReady } from '@/state/web-update';
import { makeStyles } from '@/theme/theme';
import { space } from '@/theme/tokens';

/** Cards that only the web app shows, on Today (and the install tip on Welcome). Each renders nothing elsewhere. */

/** A new version is installed and opens on the next start; this offers it now. */
export function UpdateNotice() {
  const styles = useStyles();
  const { ready, restart } = useUpdateReady();
  if (!ready) return null;
  return (
    <View style={styles.banner}>
      <Notice icon="update" title="A new version of Kindway is ready">
        It opens the next time you start Kindway. Restarting now keeps everything you’ve written.
      </Notice>
      <View style={styles.actions}>
        <Button variant="tonal" label="Restart now" onPress={restart} />
      </View>
    </View>
  );
}

/**
 * In an iPhone or iPad browser tab: how to add Kindway to the Home Screen, and why to do it
 * early (the installed app keeps its own storage, apart from the tab). Shown until dismissed.
 */
export function InstallTip() {
  const styles = useStyles();
  const [prefs, update] = useWebPrefs();
  if (!prefs || prefs.installTipDone || !inIosBrowserTab()) return null;
  return (
    <View style={styles.banner}>
      <Notice icon="export-variant" title="Add Kindway to your Home Screen">
        Tap Share, then “Add to Home Screen”. Kindway then opens full screen, like an app. Add it before you write much: the Home Screen app keeps its own journal, apart from this tab, unless you sign in and back it up.
      </Notice>
      <View style={styles.actions}>
        <Button variant="text" label="Got it" onPress={() => update({ installTipDone: true })} />
      </View>
    </View>
  );
}

/** How long "Not now" puts the backup nudge off. */
const NUDGE_AGAIN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A local-only journal on the web: browser storage is less durable than an app's, so this asks
 * again a week after "Not now" (Android asks once). Only where accounts exist and once there's
 * something to lose.
 */
export function BackupNudge() {
  const styles = useStyles();
  const { mode, configured } = useSession();
  const entries = useEntries();
  const [prefs, update] = useWebPrefs();
  if (!prefs || !onWeb() || !configured || mode !== 'local-only' || entries.length === 0) return null;
  const putOff = prefs.backupNudgeAt ? Date.parse(prefs.backupNudgeAt) : NaN;
  if (now().getTime() - putOff < NUDGE_AGAIN_MS) return null;
  return (
    <View style={styles.banner}>
      <Notice icon="cloud-upload-outline" title="Only in this browser">
        Your journal is saved in this browser alone, and browsers can clear their storage, for example when the phone runs low on space. An account backs it up and lets you open it on other devices.
      </Notice>
      <View style={styles.actions}>
        <Button variant="tonal" label="Back it up" onPress={() => router.push('/account?mode=signin')} />
        <Button variant="text" label="Not now" onPress={() => update({ backupNudgeAt: nowIso() })} />
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  banner: { marginBottom: space.md },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.xxs },
}));
