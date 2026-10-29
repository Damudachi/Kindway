import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import type { ComponentProps } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { makeStyles, useTheme } from '@/theme/theme';
import { space } from '@/theme/tokens';

type Icon = ComponentProps<typeof MaterialCommunityIcons>['name'];

const TABS: { name: string; href: '/today' | '/journal' | '/patterns' | '/compass'; label: string; icon: Icon }[] = [
  { name: 'today', href: '/today', label: 'Today', icon: 'weather-sunset' },
  { name: 'journal', href: '/journal', label: 'Journal', icon: 'book-open-page-variant-outline' },
  { name: 'patterns', href: '/patterns', label: 'Patterns', icon: 'chart-timeline-variant' },
  { name: 'compass', href: '/compass', label: 'Compass', icon: 'compass-outline' },
];

/**
 * The web app's navigation bar, drawn like the native Material one along the bottom.
 * NativeTabs' web fallback is a floating strip over the top of each screen, which on a phone
 * covers the header, so the web uses headless tabs instead (see _layout.tsx for native).
 */
export default function TabsLayout() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <Tabs style={styles.root}>
      {/* The slot doesn't shrink by default, which pushed the bar off the bottom of the screen. */}
      <TabSlot style={styles.slot} />
      <TabList style={[styles.bar, { paddingBottom: insets.bottom + space.xs }]}>
        {TABS.map((t) => (
          <TabTrigger key={t.name} name={t.name} href={t.href} asChild>
            <TabButton label={t.label} icon={t.icon} />
          </TabTrigger>
        ))}
      </TabList>
    </Tabs>
  );
}

// The slot's ref type predates React Native 0.88's element type; it's passed through untouched.
function TabButton({ isFocused, label, icon, ...props }: Omit<TabTriggerSlotProps, 'ref'> & { label: string; icon: Icon }) {
  const styles = useStyles();
  const { color } = useTheme();
  return (
    <Pressable {...props} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: !!isFocused }} style={styles.item}>
      <View style={[styles.pill, isFocused && styles.pillOn]}>
        <MaterialCommunityIcons name={icon} size={22} color={isFocused ? color.onTrailContainer : color.inkMuted} />
      </View>
      <Text variant="labelSmall" numberOfLines={1} style={isFocused ? styles.labelOn : undefined}>
        {label}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((color) => ({
  root: { flex: 1 },
  slot: { flexShrink: 1, flexBasis: 0, minHeight: 0 },
  bar: { flexDirection: 'row', backgroundColor: color.bar, paddingTop: space.xs },
  // Items and pills may shrink, so four tabs still fit at 200% zoom on a small phone.
  item: { flex: 1, minWidth: 0, alignItems: 'center', gap: space.xxs, paddingVertical: space.xxs, paddingHorizontal: 2 },
  pill: { width: '100%', maxWidth: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: color.barIndicator },
  labelOn: { color: color.ink },
}));
