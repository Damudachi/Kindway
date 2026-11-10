import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View, type TextInputInstance } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { AiUnavailableNote } from '@/components/ai-unavailable';
import { Button, IconButton } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { Field } from '@/components/controls';
import { DateDialog } from '@/components/date-dialog';
import { Dialog } from '@/components/feedback';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { daysAgo, nowIso, relativeDay } from '@/data/dates';
import { FEELINGS, PROMPTS, STYLE_LABEL, SUPPORT_STYLES } from '@/data/sample';
import { useReflectionMode, useSaveDraft } from '@/state/actions';
import { useStore } from '@/state/demo-store';
import { makeStyles, useTheme } from '@/theme/theme';
import { motion, radius, space } from '@/theme/tokens';

type Props = {
  /** First entry during onboarding uses warmer copy and its own exit routes. */
  first?: boolean;
  /** "Just one line": the page and the feelings only, for a low-energy day. */
  quick?: boolean;
  onSaved: (id: string, reflected: boolean) => void;
  /** Onboarding only: finish without writing anything. */
  onSkip?: () => void;
};

export function Composer({ first, quick, onSaved, onSkip }: Props) {
  const styles = useStyles();
  const { color, tint } = useTheme();
  const { state, dispatch } = useStore();
  const { draft } = state;
  const save = useSaveDraft();
  const mode = useReflectionMode();
  const input = useRef<TextInputInstance>(null);
  const [typing, setTyping] = useState(false);
  const [showGratitude, setShowGratitude] = useState(draft.gratitude.length > 0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [changeDate, setChangeDate] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Guards against a double tap saving the same entry twice.
  const saving = useRef(false);
  const reduce = useReducedMotion();

  useEffect(() => () => clearTimeout(typingTimer.current), []);

  // A day chosen on an empty page belongs to nothing yet; left behind, it would date an entry written days later.
  const latest = useRef(draft);
  useEffect(() => {
    latest.current = draft;
  }, [draft]);
  useEffect(
    () => () => {
      const left = latest.current;
      if (left.date !== undefined && !left.editingId && !left.text.trim()) dispatch({ type: 'draft', patch: { date: undefined } });
    },
    [dispatch],
  );

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
  const canReflect = mode !== 'off' && !editing;
  const dayLabel = relativeDay(draft.date ?? nowIso());
  const style = draft.style ?? state.supportStyle;

  const toggleCompass = (id: string) =>
    dispatch({
      type: 'draft',
      patch: { compassIds: draft.compassIds.includes(id) ? draft.compassIds.filter((x) => x !== id) : [...draft.compassIds, id] },
    });

  const doSave = (reflect: boolean) => {
    if (saving.current || empty) return;
    saving.current = true;
    const id = save({ reflect });
    if (id) onSaved(id, reflect && canReflect);
    else saving.current = false;
  };

  return (
    <Screen
      top={{
        back: true,
        small: true,
        title: editing ? 'Edit entry' : first ? 'Your first entry' : quick ? 'One line' : "Tonight's entry",
        actions:
          !empty || editing ? (
            <IconButton icon="trash-can-outline" label="Discard draft" onPress={() => setConfirmDiscard(true)} />
          ) : null,
      }}
      footer={
        <View style={styles.actions}>
          {canReflect ? (
            <>
              <Button label={mode === 'ai' ? 'Save & reflect with AI' : 'Save & reflect'} trailingIcon="arrow-right" disabled={empty} onPress={() => doSave(true)} />
              <Button variant="secondary" label="Save without AI" disabled={empty} onPress={() => doSave(false)} />
              {mode === 'ai' && <Text variant="small">{state.contextScope === 'relevant' ? 'Reflecting sends this entry, its tags and good thing, plus up to 5 recent entries from the last two weeks, to GroqCloud. Saving without AI sends nothing.' : 'Reflecting sends this entry, its tags and good thing to GroqCloud. Saving without AI sends nothing.'}</Text>}
            </>
          ) : (
            <Button label={editing ? 'Save changes' : 'Save entry'} disabled={empty} onPress={() => doSave(false)} />
          )}
          {onSkip && empty && <Button variant="text" label="Skip for now, I'll write later" onPress={onSkip} />}
        </View>
      }>
      <Animated.View style={recede}>
        <Text variant="headline" accessibilityRole="header">
          {first ? "What's been on your mind today?" : quick ? 'One line is enough.' : "What's on your mind?"}
        </Text>
        <Text variant="bodyMuted" style={styles.lede}>
          {quick ? 'A few words keep today in your journal. You can add more later.' : 'Start anywhere. It doesn’t have to be organized or make sense yet.'}
        </Text>
      </Animated.View>

      <Pressable
        onPress={() => setChangeDate(true)}
        accessibilityRole="button"
        accessibilityLabel={`Date: ${dayLabel}. Change date`}
        style={({ pressed }) => [styles.dateRow, pressed && styles.pressed]}>
        <Text variant="labelSmall">{dayLabel} · Change</Text>
      </Pressable>
      <View style={styles.page}>
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
          style={styles.input}
        />
        <View style={styles.tools}>
          <IconButton icon="microphone-outline" label="Speak instead" onPress={() => router.push('/voice?from=write')} />
        </View>
      </View>
      <Text variant="labelSmall" style={styles.status} accessibilityLiveRegion="polite">
        {empty ? 'No minimum length. No required questions.' : 'Draft saved on this device, even if you close the app'}
      </Text>

      {!quick && (
        <Animated.View style={recede}>
          <Text variant="label" style={styles.helpLabel}>
            A little help getting started
          </Text>
          <ChipRow>
            {PROMPTS.map((p) => (
              <Chip key={p.id} kind="assist" icon="plus" label={p.label} onPress={() => insertPrompt(p.insert)} />
            ))}
          </ChipRow>
        </Animated.View>
      )}

      <Animated.View style={recede}>
        <Text variant="label" style={styles.groupLabel}>
          Check in with yourself, if you like
        </Text>
        <ChipRow>
          {FEELINGS.map((f) => (
            <Chip key={f} label={f} tint={tint.feeling(f)} selected={draft.feelings.includes(f)} onPress={() => toggleFeeling(f)} />
          ))}
        </ChipRow>

        {!quick && state.compass.length > 0 && (
          <>
            <Text variant="label" style={styles.groupLabel}>
              Connect to your compass, if it fits
            </Text>
            <ChipRow>
              {state.compass.map((c) => (
                <Chip key={c.id} label={c.area} selected={draft.compassIds.includes(c.id)} onPress={() => toggleCompass(c.id)} />
              ))}
            </ChipRow>
          </>
        )}

        {quick ? null : showGratitude ? (
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

        {canReflect && !quick && (
          <>
            <Text variant="label" style={styles.groupLabel}>
              How should Kindway reflect this time?
            </Text>
            <ChipRow>
              {SUPPORT_STYLES.map((s) => (
                <Chip key={s.id} label={s.title} selected={style === s.id} onPress={() => dispatch({ type: 'draft', patch: { style: s.id } })} />
              ))}
            </ChipRow>
            <Text variant="small">
              Default: {STYLE_LABEL[state.supportStyle]}.{mode === 'ai' ? '' : ' The reflection is a simulated preview made on this device; nothing is sent anywhere.'}
            </Text>
            {mode === 'simulated' && <AiUnavailableNote scope="entry_reflection" />}
          </>
        )}
        {!canReflect && !editing && !quick && (
          <View style={styles.notice}>
            <Notice title="Journal-only mode">
              Your entry stays in your journal. Reflection previews are off until you turn them on in AI & memory.
            </Notice>
          </View>
        )}
      </Animated.View>

      <DateDialog
        visible={changeDate}
        value={draft.date ?? nowIso()}
        onCancel={() => setChangeDate(false)}
        onSave={(date) => {
          // A new entry dated today keeps no date of its own; it's dated when it's saved. An edit keeps the one chosen.
          dispatch({ type: 'draft', patch: { date: !editing && daysAgo(date) === 0 ? undefined : date } });
          setChangeDate(false);
        }}
      />

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

const useStyles = makeStyles((color, type) => ({
  lede: { marginTop: space.xs, marginBottom: space.md },
  dateRow: { minHeight: 32, justifyContent: 'center', alignSelf: 'flex-start', marginBottom: space.xxs },
  pressed: { opacity: 0.6 },
  page: {
    minHeight: 220,
    backgroundColor: color.raised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.sand,
  },
  input: { ...type.entry, flexGrow: 1, minHeight: 172, padding: space.md, paddingBottom: 0 },
  // The voice control sits at the template's lower-left, inside the page.
  tools: { flexDirection: 'row', paddingHorizontal: space.xxs, paddingBottom: space.xxs },
  status: { marginTop: space.xs },
  helpLabel: { marginTop: space.sm, marginBottom: 2 },
  groupLabel: { marginTop: space.md, marginBottom: 2 },
  gratitude: { marginTop: space.md },
  notice: { marginTop: space.lg },
  actions: { gap: space.xs },
}));
