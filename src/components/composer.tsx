import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputInstance } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { Button, IconButton } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { Field } from '@/components/controls';
import { Dialog } from '@/components/feedback';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { FEELINGS, PROMPTS, STYLE_LABEL, SUPPORT_STYLES } from '@/data/sample';
import { useSaveDraft } from '@/state/actions';
import { useStore } from '@/state/demo-store';
import { color, motion, radius, space, type } from '@/theme/tokens';

type Props = {
  /** First entry during onboarding uses warmer copy and its own exit routes. */
  first?: boolean;
  onSaved: (id: string, reflected: boolean) => void;
};

export function Composer({ first, onSaved }: Props) {
  const { state, dispatch } = useStore();
  const { draft, aiConsent } = state;
  const save = useSaveDraft();
  const input = useRef<TextInputInstance>(null);
  const [typing, setTyping] = useState(false);
  const [showGratitude, setShowGratitude] = useState(draft.gratitude.length > 0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const reduce = useReducedMotion();

  useEffect(() => () => clearTimeout(typingTimer.current), []);

  // While the user types, everything but the page recedes.
  const chrome = useSharedValue(1);
  useEffect(() => {
    const target = typing ? 0.38 : 1;
    chrome.value = reduce ? target : withTiming(target, { duration: motion.long });
  }, [typing, reduce, chrome]);
  const recede = useAnimatedStyle(() => ({ opacity: chrome.value }));

  const onChange = (text: string) => {
    dispatch({ type: 'draft', patch: { text } });
    setTyping(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTyping(false), 1600);
  };

  const insertPrompt = (insert: string) => {
    const text = draft.text.trim() ? `${draft.text.trimEnd()}\n\n${insert}` : insert;
    dispatch({ type: 'draft', patch: { text } });
    input.current?.focus();
  };

  const toggleFeeling = (f: string) =>
    dispatch({
      type: 'draft',
      patch: { feelings: draft.feelings.includes(f) ? draft.feelings.filter((x) => x !== f) : [...draft.feelings, f] },
    });

  const empty = draft.text.trim().length === 0;
  const editing = !!draft.editingId;
  const canReflect = aiConsent === 'ai' && !editing;
  const style = draft.style ?? state.supportStyle;

  const doSave = (reflect: boolean) => {
    const id = save({ reflect });
    if (id) onSaved(id, reflect && canReflect);
  };

  return (
    <Screen
      top={{
        back: true,
        title: editing ? 'Edit entry' : first ? 'Your first entry' : "Tonight's entry",
        actions:
          !empty || editing ? (
            <IconButton icon="trash-can-outline" label="Discard draft" onPress={() => setConfirmDiscard(true)} />
          ) : null,
      }}
      footer={
        <View style={styles.actions}>
          {canReflect ? (
            <>
              <Button label="Save & reflect" trailingIcon="arrow-right" disabled={empty} onPress={() => doSave(true)} />
              <Button variant="secondary" label="Save without AI" disabled={empty} onPress={() => doSave(false)} />
            </>
          ) : (
            <Button label={editing ? 'Save changes' : 'Save entry'} disabled={empty} onPress={() => doSave(false)} />
          )}
        </View>
      }>
      <Animated.View style={recede}>
        <Text variant="headline" accessibilityRole="header">
          {first ? "What's been on your mind today?" : "What's on your mind?"}
        </Text>
        <Text variant="bodyMuted" style={styles.lede}>
          Start anywhere. It doesn’t have to be organized or make sense yet.
        </Text>
      </Animated.View>

      <TextInput
        ref={input}
        value={draft.text}
        onChangeText={onChange}
        onBlur={() => setTyping(false)}
        multiline
        textAlignVertical="top"
        placeholder="Today was…"
        placeholderTextColor={color.pencil}
        cursorColor={color.trail}
        selectionColor={color.trailContainer}
        accessibilityLabel="Journal entry"
        accessibilityHint="Write freely. Nothing here is required."
        style={styles.page}
      />
      <Text variant="labelSmall" style={styles.status} accessibilityLiveRegion="polite">
        {empty ? 'No minimum length. No required questions.' : 'Draft kept on this device while you move around the app'}
      </Text>

      <Animated.View style={recede}>
        <Text variant="label" style={styles.groupLabel}>
          Check in with yourself, if you like
        </Text>
        <ChipRow>
          {FEELINGS.map((f) => (
            <Chip key={f} label={f} selected={draft.feelings.includes(f)} onPress={() => toggleFeeling(f)} />
          ))}
        </ChipRow>

        <Text variant="label" style={styles.groupLabel}>
          A little help getting started
        </Text>
        <ChipRow>
          {PROMPTS.map((p) => (
            <Chip key={p.id} kind="assist" icon="plus" label={p.label} onPress={() => insertPrompt(p.insert)} />
          ))}
          <Chip kind="assist" icon="microphone-outline" label="Speak instead" onPress={() => router.push('/voice?from=write')} />
        </ChipRow>

        {showGratitude ? (
          <View style={styles.gratitude}>
            <Field
              label="One good thing (optional)"
              helper="Not to erase the hard parts, just to make room for more than one truth."
              value={draft.gratitude}
              onChangeText={(gratitude) => dispatch({ type: 'draft', patch: { gratitude } })}
            />
          </View>
        ) : (
          <ChipRow>
            <Chip kind="assist" icon="plus" label="Notice one good thing" onPress={() => setShowGratitude(true)} />
          </ChipRow>
        )}

        {canReflect && (
          <>
            <Text variant="label" style={styles.groupLabel}>
              How should Kindway reflect this time?
            </Text>
            <ChipRow>
              {SUPPORT_STYLES.map((s) => (
                <Chip key={s.id} label={s.title} selected={style === s.id} onPress={() => dispatch({ type: 'draft', patch: { style: s.id } })} />
              ))}
            </ChipRow>
            <Text variant="small">Default: {STYLE_LABEL[state.supportStyle]}. Only this entry is sent when you choose to reflect.</Text>
          </>
        )}
        {!canReflect && !editing && (
          <View style={styles.notice}>
            <Notice title="Journal-only mode">
              Your entry stays in your journal. AI reflections are off until you turn them on in AI & memory.
            </Notice>
          </View>
        )}
      </Animated.View>

      <Dialog
        visible={confirmDiscard}
        title={editing ? 'Discard your changes?' : 'Discard this draft?'}
        body={editing ? 'The saved entry stays as it was.' : 'What you wrote here will be removed. This can’t be undone.'}
        confirmLabel="Discard"
        destructive
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          dispatch({ type: 'clearDraft' });
          router.back();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  lede: { marginTop: space.xs, marginBottom: space.md },
  page: {
    ...type.entry,
    minHeight: 220,
    backgroundColor: color.raised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.sand,
    padding: space.md,
  },
  status: { marginTop: space.xs, marginBottom: space.lg },
  groupLabel: { marginTop: space.md, marginBottom: 2 },
  gratitude: { marginTop: space.md },
  notice: { marginTop: space.lg },
  actions: { gap: space.xs },
});
