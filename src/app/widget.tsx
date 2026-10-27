import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/button';
import { SwitchRow } from '@/components/controls';
import { useSnackbar } from '@/components/feedback';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useStore } from '@/state/demo-store';
import { widgetSnapshot } from '@/state/widget-sync';
import { makeStyles, useTheme } from '@/theme/theme';
import { radius, space } from '@/theme/tokens';
import { promptFor } from '@/widget/content';
import { pinWidget } from '@/widget/native';

/**
 * The Android home-screen widget: what it shows, whether it may show the Tomorrow Bridge step,
 * and a shortcut to add it. The preview below is drawn like the widget, in the current scheme.
 */
export default function Widget() {
  const styles = useStyles();
  const { color } = useTheme();
  const { state, dispatch } = useStore();
  const snack = useSnackbar();
  const [adding, setAdding] = useState(false);
  const shown = widgetSnapshot(state.tomorrow, state.widgetShowsStep);

  const add = async () => {
    setAdding(true);
    const asked = await pinWidget();
    setAdding(false);
    if (!asked) snack({ message: 'Your launcher can’t add it from here. Long-press your home screen, choose Widgets, then find Kindway.' });
  };

  return (
    <Screen top={{ back: true, title: 'Home-screen widget' }}>
      <Text variant="headline" accessibilityRole="header">
        A small doorway, not a public diary.
      </Text>
      <Text variant="bodyMuted" style={styles.lede}>
        It shows a writing prompt, or your next small step, and opens Kindway when you tap it. It never shows your entries.
      </Text>

      <View style={styles.wallpaper} accessibilityLabel={`Widget preview: ${shown.step ?? promptFor()}`}>
        <View style={styles.widget}>
          <View style={styles.widgetHead}>
            <View style={[styles.dot, { backgroundColor: shown.step ? color.lichen : color.lantern }]} />
            <Text variant="labelSmall">{shown.step ? (shown.stepDue === 'today' ? 'Your step for today' : 'Your step for tomorrow') : 'Kindway'}</Text>
          </View>
          <Text variant="entryTitle" numberOfLines={3}>
            {shown.step ?? promptFor()}
          </Text>
          <View style={styles.widgetBtn}>
            <Text variant="label" style={{ color: color.onPrimary }}>
              Write a thought
            </Text>
          </View>
        </View>
      </View>

      <Button label="Add to home screen" icon="widgets-outline" loading={adding} onPress={() => void add()} style={styles.add} />
      <Text variant="small">Or long-press your home screen, choose Widgets, and find Kindway.</Text>

      <SwitchRow
        title="Show my Tomorrow Bridge step"
        detail={state.widgetShowsStep ? 'On. Anyone who sees your home screen could read it.' : 'Off. The widget shows only the prompt.'}
        value={state.widgetShowsStep}
        onChange={(widgetShowsStep) => dispatch({ type: 'patch', patch: { widgetShowsStep } })}
      />
      <Button variant="tonal" label="Set up gentle reminders" trailingIcon="arrow-right" onPress={() => router.push('/settings/reminders')} />
    </Screen>
  );
}

const useStyles = makeStyles((color) => ({
  lede: { marginTop: space.xs, marginBottom: space.lg },
  wallpaper: { borderRadius: radius.xl, backgroundColor: color.trailContainer, padding: space.lg },
  widget: { borderRadius: 24, backgroundColor: color.raised, padding: space.md, gap: space.sm },
  widgetHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  dot: { width: 10, height: 10, borderRadius: 5 },
  widgetBtn: { alignSelf: 'flex-start', minHeight: 38, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.full, backgroundColor: color.primary },
  add: { marginTop: space.lg, marginBottom: space.xs },
}));
