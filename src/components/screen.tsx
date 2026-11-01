import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View, type ScrollViewInstance, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeldLight } from '@/components/brand';
import { IconButton } from '@/components/button';
import { Text } from '@/components/text';
import { onWeb } from '@/services/platform';
import { makeStyles, useTheme } from '@/theme/theme';
import { space } from '@/theme/tokens';

type TopBarProps = {
  title?: string;
  back?: boolean;
  onBack?: () => void;
  actions?: ReactNode;
  /** Brand wordmark in place of a title (Today). */
  wordmark?: boolean;
  /** A compact UI title for working surfaces (the composer, Talk), where a page title would crowd out the writing. */
  small?: boolean;
};

/**
 * Back, or to the root route when there's nothing to go back to (a screen opened from an email
 * link replaces itself); the root route opens Today or onboarding from what's saved.
 */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * Material top app bar: a 64dp row with back on the left and actions on the right. The page title
 * is Kindway's own voice (Fraunces): in the row on a tab's root, on its own line below the row
 * when there's a back arrow (Material's medium bar), so long titles never squeeze the actions.
 */
export function TopBar({ title, back, onBack, actions, wordmark, small }: TopBarProps) {
  const styles = useStyles();
  const { color } = useTheme();
  const below = !!title && !wordmark && !small && !!back;
  return (
    <View>
      <View style={styles.bar}>
        {back ? (
          <IconButton icon="arrow-left" label="Back" onPress={onBack ?? goBack} tint={color.ink} />
        ) : (
          <View style={{ width: space.xs }} />
        )}
        <View style={styles.titleWrap}>
          {wordmark ? (
            <View style={styles.brand}>
              <HeldLight size={26} breathe />
              <Text variant="title" accessibilityRole="header" style={styles.wordmark}>
                Kindway
              </Text>
            </View>
          ) : title && small ? (
            <Text variant="label" accessibilityRole="header" numberOfLines={1} style={styles.title}>
              {title}
            </Text>
          ) : title && !below ? (
            <Text variant="pageTitle" accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.inlineTitle}>
              {title}
            </Text>
          ) : null}
        </View>
        <View style={styles.actions}>{actions}</View>
      </View>
      {below && (
        <Text variant="pageTitle" accessibilityRole="header" style={styles.belowTitle}>
          {title}
        </Text>
      )}
    </View>
  );
}

/**
 * How a screen makes room for the keyboard, on both platforms. The app draws edge to edge, so
 * Android doesn't resize the window for the keyboard (without this the Talk composer ended up
 * behind it). The padding is only the part of the screen the keyboard actually covers, so it
 * stays right even where a window does resize.
 */
export const keyboardBehavior = 'padding' as const;

/**
 * The bottom inset to keep clear. While the keyboard is open on Android, the keyboard padding
 * already covers the navigation bar, so keeping its inset too left an empty band above the
 * keyboard (iOS keeps the inset, as before).
 */
export function useBottomInset(inset: number) {
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const shown = Keyboard.addListener('keyboardDidShow', () => setKeyboard(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboard(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  return keyboard ? 0 : inset;
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
  /** For screens that need to scroll themselves, e.g. back to the top when content is replaced. */
  scrollRef?: Ref<ScrollViewInstance>;
  /** Drawn behind everything, from the very top of the screen (status bar included); stays put while content scrolls. */
  backdrop?: ReactNode;
  /** Pull down to refresh. Not on the web, where react-native-web has no pull to refresh. */
  onRefresh?: () => Promise<void>;
};

/** The spinner never stays longer than this, even if a refresh is still going. */
const REFRESH_CAP_MS = 10_000;

/** Pull-to-refresh state: on while `onRefresh` runs, off when it settles or after the cap. */
function useRefreshing(onRefresh: (() => Promise<void>) | undefined) {
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);
  const cap = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(cap.current);
    };
  }, []);
  const start = useCallback(() => {
    if (!onRefresh) return;
    setRefreshing(true);
    clearTimeout(cap.current);
    const capped = new Promise<void>((resolve) => (cap.current = setTimeout(resolve, REFRESH_CAP_MS)));
    const timer = cap.current;
    void Promise.race([onRefresh().catch(() => {}), capped]).then(() => {
      clearTimeout(timer);
      if (alive.current) setRefreshing(false);
    });
  }, [onRefresh]);
  return { refreshing, start };
}

export function Screen({ children, top, footer, scroll = true, contentStyle, inTabs, scrollRef, backdrop, onRefresh }: ScreenProps) {
  const styles = useStyles();
  const { color } = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = useBottomInset(inTabs ? 0 : insets.bottom);
  const pull = onRefresh && !onWeb() ? onRefresh : undefined;
  const { refreshing, start } = useRefreshing(pull);
  const body = scroll ? (
    <ScrollView
      ref={scrollRef}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        pull ? (
          <RefreshControl refreshing={refreshing} onRefresh={start} tintColor={color.trail} colors={[color.trail]} progressBackgroundColor={color.raised} />
        ) : undefined
      }
      contentContainerStyle={[styles.content, { paddingBottom: footer ? space.lg : space.xxl + bottom }, contentStyle]}>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, styles.fill, contentStyle]}>{children}</View>
  );
  return (
    <KeyboardAvoidingView behavior={keyboardBehavior} style={[styles.root, { paddingTop: insets.top }]}>
      {backdrop}
      {top !== false && <TopBar {...top} />}
      {body}
      {footer && <View style={[styles.footer, { paddingBottom: space.sm + bottom }]}>{footer}</View>}
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((color) => ({
  root: { flex: 1, backgroundColor: color.paper },
  fill: { flex: 1 },
  bar: { height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xxs },
  titleWrap: { flex: 1, paddingHorizontal: space.sm },
  wordmark: { letterSpacing: -0.2 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  title: { fontSize: 16, lineHeight: 24 },
  // Aligned to the 20dp gutter: 4dp bar padding + 8dp spacer + 12dp title padding, less 4.
  inlineTitle: { marginLeft: -space.xxs },
  belowTitle: { paddingHorizontal: space.gutter, paddingBottom: space.xs },
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
}));
