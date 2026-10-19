import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/button';
import { Text } from '@/components/text';
import { color, space } from '@/theme/tokens';

type TopBarProps = {
  title?: string;
  back?: boolean;
  onBack?: () => void;
  actions?: ReactNode;
  /** Brand wordmark in place of a title (Today). */
  wordmark?: boolean;
};

/** Material small top app bar: 64dp, back on the left, actions on the right. */
export function TopBar({ title, back, onBack, actions, wordmark }: TopBarProps) {
  return (
    <View style={styles.bar}>
      {back ? (
        <IconButton icon="arrow-left" label="Back" onPress={onBack ?? (() => router.back())} tint={color.ink} />
      ) : (
        <View style={{ width: space.xs }} />
      )}
      <View style={styles.titleWrap}>
        {wordmark ? (
          <Text variant="title" accessibilityRole="header" style={styles.wordmark}>
            Kindway
          </Text>
        ) : title ? (
          <Text variant="label" accessibilityRole="header" numberOfLines={1} style={styles.title}>
            {title}
          </Text>
        ) : null}
      </View>
      <View style={styles.actions}>{actions}</View>
    </View>
  );
}

type ScreenProps = {
  children: ReactNode;
  top?: TopBarProps | false;
  /** Pinned below the scroll area, stays above the keyboard. */
  footer?: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  /** Screens inside the tab navigator: the native bar handles the bottom inset. */
  inTabs?: boolean;
};

export function Screen({ children, top, footer, scroll = true, contentStyle, inTabs }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const bottom = inTabs ? 0 : insets.bottom;
  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, { paddingBottom: footer ? space.lg : space.xxl + bottom }, contentStyle]}>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, styles.fill, contentStyle]}>{children}</View>
  );
  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.root, { paddingTop: insets.top }]}>
      {top !== false && <TopBar {...top} />}
      {body}
      {footer && <View style={[styles.footer, { paddingBottom: space.sm + bottom }]}>{footer}</View>}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper },
  fill: { flex: 1 },
  bar: { height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xxs },
  titleWrap: { flex: 1, paddingHorizontal: space.sm },
  wordmark: { letterSpacing: -0.2 },
  title: { fontSize: 16, lineHeight: 24 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  content: { paddingHorizontal: space.gutter, paddingTop: space.xs },
  footer: {
    paddingHorizontal: space.gutter,
    paddingTop: space.sm,
    gap: space.xs,
    backgroundColor: color.paper,
    borderTopWidth: 1,
    borderTopColor: color.sand,
  },
});
