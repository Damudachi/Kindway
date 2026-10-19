import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { RadioRow, SwitchRow } from '@/components/controls';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { Blaze } from '@/components/trail';
import { color, radius, space } from '@/theme/tokens';

type Style = 'prompt' | 'quick' | 'reminder';

const STYLES: { id: Style; title: string; detail: string }[] = [
  { id: 'prompt', title: 'Gentle prompt', detail: 'A rotating, generic prompt and a shortcut to write.' },
  { id: 'quick', title: 'Quick add', detail: 'A minimal tile that opens straight to writing.' },
  { id: 'reminder', title: 'Reminder', detail: 'A discreet nudge at the time you choose.' },
];

/**
 * Preview and configuration only.
 * TODO(widget): native Android App Widget spike (Glance / RemoteViews via a config plugin). A React Native view is not a widget.
 */
export default function Widget() {
  const [style, setStyle] = useState<Style>('prompt');
  const [showText, setShowText] = useState(false);

  return (
    <Screen top={{ back: true, title: 'Home-screen widget' }}>
      <Text variant="headline" accessibilityRole="header">
        A small doorway, not a public diary.
      </Text>
      <Text variant="bodyMuted" style={styles.lede}>
        Quiet enough to live on your home screen. It never shows what you wrote unless you choose that.
      </Text>

      <View style={styles.wallpaper} accessibilityLabel="Widget preview">
        <View style={[styles.widget, style === 'quick' && styles.widgetSmall]}>
          <View style={styles.widgetHead}>
            <Blaze size="small" />
            <Text variant="labelSmall" style={styles.widgetMuted}>
              Kindway
            </Text>
          </View>
          {style !== 'quick' && (
            <Text variant="entryTitle" style={styles.widgetText}>
              {showText ? '“When I started comparing…”' : style === 'reminder' ? 'A moment for yourself, whenever you want it.' : 'What are you carrying into tonight?'}
            </Text>
          )}
          <View style={styles.widgetBtn}>
            <Text variant="label" style={{ color: color.ink }}>
              Write a thought
            </Text>
          </View>
        </View>
      </View>

      <Text variant="title" style={styles.groupTitle}>
        Widget style
      </Text>
      <View accessibilityRole="radiogroup">
        {STYLES.map((s) => (
          <RadioRow key={s.id} title={s.title} detail={s.detail} selected={style === s.id} onPress={() => setStyle(s.id)} />
        ))}
      </View>
      <SwitchRow
        title="Show text from my latest entry"
        detail="Off by default. Anyone who sees your phone could read it."
        value={showText}
        onChange={setShowText}
      />
      <Notice tone="demo" title="Preview only">
        The real Android widget needs native work and hasn’t been built yet. Nothing is added to your home screen.
      </Notice>
      <Button variant="text" label="Set up gentle reminders" trailingIcon="arrow-right" onPress={() => router.push('/settings/reminders')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  lede: { marginTop: space.xs, marginBottom: space.lg },
  wallpaper: { borderRadius: radius.xl, backgroundColor: '#5B6B66', padding: space.lg, alignItems: 'flex-start' },
  widget: { width: '100%', borderRadius: 24, backgroundColor: '#2A2C30', padding: space.md, gap: space.sm },
  widgetSmall: { width: 170 },
  widgetHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  widgetMuted: { color: '#C9C8C2' },
  widgetText: { color: '#F4F2EC' },
  widgetBtn: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.full, backgroundColor: '#ECEAE3' },
  groupTitle: { marginTop: space.xl, marginBottom: space.sm },
});
