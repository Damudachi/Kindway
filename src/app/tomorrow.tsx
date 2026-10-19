import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { Field } from '@/components/controls';
import { useSnackbar } from '@/components/feedback';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { Blaze } from '@/components/trail';
import { DEMO_NOW, daysAgo } from '@/data/dates';
import { useStore } from '@/state/demo-store';
import { color, radius, space } from '@/theme/tokens';

const IDEAS = ['Start with 10 minutes', 'Ask someone for help', 'Rest first', 'Send one message I’ve been putting off'];

export default function Tomorrow() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { state, dispatch } = useStore();
  const snack = useSnackbar();
  const source = state.entries.find((e) => e.id === from);
  const current = state.tomorrow?.status === 'open' && daysAgo(state.tomorrow.savedOn) === 0 ? state.tomorrow : null;
  const [text, setText] = useState(current?.text ?? '');

  const save = () => {
    dispatch({ type: 'patch', patch: { tomorrow: { text: text.trim(), savedOn: DEMO_NOW.toISOString(), status: 'open' } } });
    snack({ message: "Saved. Tomorrow we'll ask whether it helped, not whether you did it." });
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
              if (current) dispatch({ type: 'patch', patch: { tomorrow: null } });
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

      {(source?.reflection?.nextStep || source?.reflection?.question) && (
        <View style={styles.from}>
          <Text variant="labelSmall">From your reflection on “{source.title}”</Text>
          <Text variant="pencil">{source.reflection.nextStep ?? source.reflection.question}</Text>
        </View>
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
        <Field label="Or in your own words" value={text} onChangeText={setText} placeholder="One small step" maxLength={120} />
      </View>
      <Text variant="small">Tomorrow, Kindway will ask whether this was useful, not whether you “passed.” Changing your mind is always fine.</Text>
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
