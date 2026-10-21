import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { Field } from '@/components/controls';
import { useSnackbar } from '@/components/feedback';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { Blaze } from '@/components/trail';
import type { TomorrowStep } from '@/data/types';
import { useStore } from '@/state/demo-store';
import { editText, fitStep, newStep, STEP_MAX } from '@/state/tomorrow';
import { color, radius, space } from '@/theme/tokens';

const IDEAS = ['Start with 10 minutes', 'Ask someone for help', 'Rest first', 'Send one message I’ve been putting off'];

/**
 * A suggested step the user can take into the field, and where it came from. Only structured
 * suggestions qualify: a reflection's `nextStep`, or a review's suggested action. Nothing is
 * read out of free text, and nothing is saved until the user taps Save.
 */
type Suggestion = { text: string; label: string; note: string; source: TomorrowStep['source'] };

type Params = {
  /** An entry whose reflection may carry a suggested step. */
  from?: string;
  /** A review's suggested action, with the kind of review it came from. */
  suggestion?: string;
  basis?: 'ai' | 'tags';
  /** Start with the suggestion already in the field (still not saved). */
  use?: string;
};

function suggestionFrom(params: Params, entries: ReturnType<typeof useStore>['state']['entries']): Suggestion | null {
  const entry = params.from ? entries.find((e) => e.id === params.from && !e.sample) : undefined;
  const fromReflection = entry?.reflection?.nextStep?.trim();
  if (entry && fromReflection) {
    const ai = entry.reflection?.source === 'ai';
    return {
      text: fromReflection,
      label: ai ? `Suggested by AI in your reflection on “${entry.title}”` : `Simulated suggestion from your reflection preview on “${entry.title}”`,
      note: ai ? 'Written by AI, so it can be wrong. Change it, or leave it.' : 'Pre-written text, not generated from your words.',
      source: { kind: 'reflection', entryId: entry.id },
    };
  }
  const fromReview = params.suggestion?.trim();
  if (fromReview) {
    const ai = params.basis === 'ai';
    return {
      text: fromReview,
      label: ai ? 'Suggested by AI in your review' : 'From your Patterns',
      note: ai ? 'Written by AI, so it can be wrong. Change it, or leave it.' : 'Based on the tags and marks you added.',
      source: { kind: 'insights' },
    };
  }
  return null;
}

export default function Tomorrow() {
  const params = useLocalSearchParams<Params>();
  const { state, dispatch } = useStore();
  const snack = useSnackbar();
  const source = state.entries.find((e) => e.id === params.from && !e.sample);
  const suggestion = suggestionFrom(params, state.entries);
  const fitted = suggestion ? fitStep(suggestion.text) : null;
  // Any open step is edited in place and keeps its day; otherwise a new one is planned for tomorrow.
  const current = state.tomorrow?.status === 'open' ? state.tomorrow : null;
  // A suggestion only starts in the field when there's no open step it would replace.
  const prefill = !current && params.use === '1' && fitted ? fitted.text : '';
  const [text, setText] = useState(current?.text ?? prefill);
  const [usedSuggestion, setUsedSuggestion] = useState(!!prefill);
  const saving = useRef(false);

  const save = () => {
    if (saving.current || !text.trim()) return;
    // One save per visit: a second tap while the screen closes must not save again.
    saving.current = true;
    const from = usedSuggestion && suggestion ? suggestion.source : source ? { kind: 'reflection' as const, entryId: source.id } : undefined;
    dispatch({ type: 'tomorrow', step: current ? { ...editText(current, text), ...(usedSuggestion && { source: from }) } : newStep(text, from) });
    snack({ message: current ? 'Step updated.' : 'Saved for tomorrow. Marking it done, moving it or letting it go are all fine.' });
    router.back();
  };

  return (
    <Screen
      top={{ back: true, title: 'Tomorrow Bridge' }}
      footer={
        <>
          <Button label={current ? 'Update my step' : 'Save my step'} disabled={!text.trim()} onPress={save} />
          <Button
            variant="text"
            style={styles.center}
            label={current ? 'Remove this step' : "I'd rather leave this open"}
            onPress={() => {
              if (current) dispatch({ type: 'tomorrow', step: null });
              router.back();
            }}
          />
        </>
      }>
      <View style={styles.mark}>
        <Blaze />
        <View style={styles.dash} />
        <Blaze state="next" />
      </View>
      <Text variant="headline" accessibilityRole="header">
        What would help future-you?
      </Text>
      <Text variant="bodyMuted" style={styles.lede}>
        You don’t need a grand plan. One small, kind step is enough, and choosing rest counts.
      </Text>

      {suggestion && fitted ? (
        <View style={styles.from}>
          <Text variant="labelSmall">{suggestion.label}</Text>
          <Text variant="pencil">{suggestion.text}</Text>
          <Text variant="small">{suggestion.note}</Text>
          {text !== fitted.text && (
            <Button
              variant="text"
              label={current ? 'Use this instead' : 'Use this'}
              accessibilityHint="Puts the suggestion in the field below. Nothing is saved until you save."
              onPress={() => {
                setText(fitted.text);
                setUsedSuggestion(true);
              }}
            />
          )}
          {text === fitted.text && fitted.shortened && <Text variant="small">Shortened to fit one line. Edit it if you like.</Text>}
        </View>
      ) : (
        source?.reflection?.question && (
          <View style={styles.from}>
            <Text variant="labelSmall">From your reflection on “{source.title}”</Text>
            <Text variant="pencil">{source.reflection.question}</Text>
          </View>
        )
      )}

      {current && suggestion && (
        <Notice title="You already have a step">
          “{current.text}”. Kindway keeps one step at a time, so using a suggestion changes this step’s wording. Nothing changes unless you tap Update my step.
        </Notice>
      )}

      <Text variant="label" style={styles.groupLabel}>
        Ideas, if any fit
      </Text>
      <ChipRow>
        {IDEAS.map((i) => (
          <Chip key={i} label={i} selected={text === i} onPress={() => setText(i)} />
        ))}
      </ChipRow>
      <View style={styles.field}>
        <Field label="Or in your own words" value={text} onChangeText={setText} placeholder="One small step" maxLength={STEP_MAX} />
      </View>
      <Text variant="small">It will show on Today. You can mark it done, move it, edit it or let it go, and Kindway won’t count anything. No notification is sent in this prototype.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  mark: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginVertical: space.md },
  dash: { width: 40, height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderColor: color.lichen },
  lede: { marginTop: space.xs, marginBottom: space.md },
  from: { padding: space.md, borderRadius: radius.md, backgroundColor: color.raised, borderWidth: 1, borderColor: color.sand, gap: space.xxs, marginBottom: space.xs },
  groupLabel: { marginTop: space.md },
  field: { marginTop: space.md },
  center: { alignSelf: 'center' },
});
