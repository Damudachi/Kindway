import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Modal, Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Text } from '@/components/text';
import { makeStyles, useTheme } from '@/theme/theme';
import { radius, space } from '@/theme/tokens';

type Snack = { message: string; action?: { label: string; onPress: () => void } };

const SnackContext = createContext<(s: Snack) => void>(() => {});

/** Material snackbar for transient feedback, announced to TalkBack. */
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const { color } = useTheme();
  const [snack, setSnack] = useState<Snack | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();

  const show = useCallback((s: Snack) => {
    clearTimeout(timer.current);
    setSnack(s);
    AccessibilityInfo.announceForAccessibility(s.message);
    timer.current = setTimeout(() => setSnack(null), s.action ? 6000 : 4000);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <SnackContext value={show}>
      {children}
      {snack && (
        <Animated.View
          entering={reduce ? undefined : FadeIn.duration(150)}
          exiting={reduce ? undefined : FadeOut.duration(150)}
          style={[styles.snack, { bottom: insets.bottom + 96 }]}
          accessibilityLiveRegion="polite">
          <Text variant="body" style={styles.snackText}>
            {snack.message}
          </Text>
          {snack.action && (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                snack.action?.onPress();
                setSnack(null);
              }}
              style={styles.snackAction}>
              <Text variant="label" style={{ color: color.trailContainer }}>
                {snack.action.label}
              </Text>
            </Pressable>
          )}
        </Animated.View>
      )}
    </SnackContext>
  );
}

export function useSnackbar() {
  return use(SnackContext);
}

type DialogProps = {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  confirmDisabled?: boolean;
  confirmLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
};

/**
 * Whether app lock's cover is up. state/app-lock provides it; it lives here so this file needn't
 * import the lock. A Modal is its own window above the lock, so a dialog hides while it's up.
 */
export const LockCoverContext = createContext(false);

/** Material basic dialog. Only for decisions that must interrupt (delete, sign out). */
export function Dialog({ visible, title, body, confirmLabel, cancelLabel = 'Cancel', destructive, confirmDisabled, confirmLoading, onConfirm, onCancel, children }: DialogProps) {
  const styles = useStyles();
  const covered = use(LockCoverContext);
  return (
    <Modal visible={visible && !covered} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.scrim}>
        <View style={styles.dialog} accessibilityViewIsModal>
          <Text variant="title" accessibilityRole="header" style={{ fontSize: 22, lineHeight: 28 }}>
            {title}
          </Text>
          <Text variant="bodyMuted">{body}</Text>
          {children}
          <View style={styles.dialogActions}>
            <Button variant="text" label={cancelLabel} onPress={onCancel} />
            <Button compact variant={destructive ? 'danger' : 'primary'} label={confirmLabel} disabled={confirmDisabled} loading={confirmLoading} onPress={onConfirm} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((color) => ({
  snack: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    minHeight: 48,
    borderRadius: radius.sm,
    backgroundColor: color.ink,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: space.md,
    paddingVertical: space.xs,
    gap: space.xs,
  },
  snackText: { color: color.onInk, flex: 1, fontSize: 14, lineHeight: 20 },
  snackAction: { minHeight: 48, justifyContent: 'center', paddingHorizontal: space.md },
  scrim: { flex: 1, backgroundColor: color.scrim, justifyContent: 'center', padding: space.lg },
  dialog: { backgroundColor: color.raised, borderRadius: radius.xl, padding: space.lg, gap: space.md },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: space.xs },
}));
