import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { CheckRow, Field, RadioRow, Section, Segmented, SwitchRow } from '@/components/controls';
import { Dialog, useSnackbar } from '@/components/feedback';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { relativeDay } from '@/data/dates';
import { STYLE_LABEL, SUPPORT_STYLES } from '@/data/sample';
import type { ChallengeLevel, Memory } from '@/data/types';
import { useEntries, useStore, type DemoState } from '@/state/demo-store';
import { color, space } from '@/theme/tokens';

const LEVELS: { id: ChallengeLevel; label: string }[] = [
  { id: 'gentle', label: 'Gentle' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'direct', label: 'More direct' },
];

export default function AiMemory() {
  const { state, dispatch } = useStore();
  const entries = useEntries();
  const snack = useSnackbar();
  const [editing, setEditing] = useState<Memory | null>(null);
  const [editText, setEditText] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const patch = (p: Partial<DemoState>) => dispatch({ type: 'patch', patch: p });
  const aiOn = state.aiConsent === 'ai';

  return (
    <Screen top={{ back: true, title: 'AI & memory' }}>
      <Text variant="headline" accessibilityRole="header">
        How should Kindway reflect with you?
      </Text>

      <Section first>
        <SwitchRow
          title="AI reflections"
          detail={aiOn ? 'On. Entries are sent only when you ask for a reflection.' : 'Off. Your journal works fully without AI.'}
          value={aiOn}
          onChange={(v) => patch({ aiConsent: v ? 'ai' : 'journal-only' })}
        />
      </Section>

      <Section title="Default support style">
        <View accessibilityRole="radiogroup">
          {[...SUPPORT_STYLES, { id: 'ask' as const, title: STYLE_LABEL.ask, detail: 'Choose a style when you write.' }].map((s) => (
            <RadioRow key={s.id} title={s.title} detail={s.detail} selected={state.supportStyle === s.id} onPress={() => patch({ supportStyle: s.id })} />
          ))}
        </View>
      </Section>

      <Section title="Challenge me gently">
        <SwitchRow
          title="Question my assumptions, kindly"
          detail="Never harsh, never a verdict. You can always say it doesn't fit."
          value={state.challengeGently}
          onChange={(challengeGently) => patch({ challengeGently })}
        />
        {state.challengeGently && <Segmented label="Challenge level" options={LEVELS} value={state.challengeLevel} onChange={(challengeLevel) => patch({ challengeLevel })} />}
      </Section>

      <Section title="What reflections can see">
        <RadioRow
          title="This entry and a few related ones"
          detail="Up to two weeks back, named with their dates when used. Compass values only when relevant."
          selected={state.contextScope === 'relevant'}
          onPress={() => patch({ contextScope: 'relevant' })}
        />
        <RadioRow
          title="This entry only"
          detail="No past entries or compass values are used."
          selected={state.contextScope === 'current'}
          onPress={() => patch({ contextScope: 'current' })}
        />
      </Section>

      <Section title="Weekly insights">
        <SwitchRow
          title="Weekly patterns"
          detail="Look back across the week when you ask, with dates you can check."
          value={state.weeklyPatterns}
          onChange={(weeklyPatterns) => patch({ weeklyPatterns, weekly: { status: 'idle' } })}
        />
        <SwitchRow
          title="Consider my compass"
          detail="Only values you let AI reference. Any suggestion stays optional."
          value={state.insightsUseCompass}
          disabled={!state.weeklyPatterns}
          onChange={(insightsUseCompass) => patch({ insightsUseCompass })}
        />
      </Section>

      <Section title="Entries available for analysis">
        <Text variant="small">
          Unchecked entries stay in your journal but are never used for weekly insights or as context for other reflections.
        </Text>
        {entries.length === 0 ? (
          <Text variant="bodyMuted" style={styles.gap}>
            No entries yet.
          </Text>
        ) : (
          entries.map((e) => (
            <CheckRow
              key={e.id}
              label={`${relativeDay(e.date)} · ${e.title}`}
              checked={!e.excludeFromAnalysis}
              onChange={(v) => dispatch({ type: 'updateEntry', id: e.id, patch: { excludeFromAnalysis: !v } })}
            />
          ))
        )}
      </Section>

      <Section title="Saved memory">
        <Text variant="small">Things Kindway may remember between reflections. Correct or delete anything.</Text>
        {state.memories.length === 0 ? (
          <Text variant="bodyMuted" style={styles.gap}>
            Nothing saved.
          </Text>
        ) : (
          state.memories.map((m) => (
            <View key={m.id} style={styles.memory}>
              <MaterialCommunityIcons name="pencil-outline" size={18} color={color.pencil} style={styles.memIcon} />
              <View style={styles.flex}>
                {editing?.id === m.id ? (
                  <>
                    <Field label="Correct this memory" value={editText} onChangeText={setEditText} multiline autoFocus />
                    <View style={styles.row}>
                      <Button
                        variant="secondary"
                        label="Save"
                        onPress={() => {
                          dispatch({ type: 'patch', patch: { memories: state.memories.map((x) => (x.id === m.id ? { ...x, text: editText.trim() } : x)) } });
                          setEditing(null);
                        }}
                      />
                      <Button variant="text" label="Cancel" onPress={() => setEditing(null)} />
                    </View>
                  </>
                ) : (
                  <>
                    <Text variant="pencil">{m.text}</Text>
                    <Text variant="labelSmall">{m.source}</Text>
                    <View style={styles.row}>
                      <Button variant="text" label="Correct" onPress={() => { setEditing(m); setEditText(m.text); }} />
                      <Button
                        variant="dangerText"
                        label="Delete"
                        onPress={() => {
                          dispatch({ type: 'patch', patch: { memories: state.memories.filter((x) => x.id !== m.id) } });
                          snack({ message: 'Memory deleted from this demo session.' });
                        }}
                      />
                    </View>
                  </>
                )}
              </View>
            </View>
          ))
        )}
        {state.memories.length > 0 && <Button variant="secondary" label="Clear all saved memory" onPress={() => setConfirmClear(true)} style={styles.gap} />}
      </Section>

      <Button variant="text" label="Manage data and deletion" trailingIcon="arrow-right" onPress={() => router.push('/settings/privacy')} />

      <Dialog
        visible={confirmClear}
        title="Clear all saved memory?"
        body="Reflections will stop using anything remembered. Your entries are not deleted."
        confirmLabel="Clear memory"
        destructive
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          patch({ memories: [] });
          setConfirmClear(false);
          snack({ message: 'Saved memory cleared in this demo. No server data exists yet.' });
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: space.md },
  memory: { flexDirection: 'row', gap: space.sm, paddingTop: space.md },
  memIcon: { marginTop: 3 },
  flex: { flex: 1, gap: 2 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
