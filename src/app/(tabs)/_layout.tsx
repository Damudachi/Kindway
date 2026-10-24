import { NativeTabs } from 'expo-router/native-tabs';

import { useTheme } from '@/theme/theme';

/** Material navigation bar (native) with four destinations. */
export default function TabsLayout() {
  const { color } = useTheme();
  return (
    <NativeTabs
      backgroundColor={color.bar}
      indicatorColor={color.barIndicator}
      labelVisibilityMode="labeled"
      labelStyle={{ default: { color: color.inkMuted }, selected: { color: color.ink } }}
      iconColor={{ default: color.inkMuted, selected: color.onTrailContainer }}>
      <NativeTabs.Trigger name="today">
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="wb_twilight" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="journal">
        <NativeTabs.Trigger.Label>Journal</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="menu_book" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="patterns">
        <NativeTabs.Trigger.Label>Patterns</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="insights" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="compass">
        <NativeTabs.Trigger.Label>Compass</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="explore" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
