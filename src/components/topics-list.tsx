import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Field } from '@/components/controls';
import { Dialog } from '@/components/feedback';
import { StateView } from '@/components/notice';
import { Text } from '@/components/text';
import type { Topic } from '@/data/types';
import { useStore } from '@/state/demo-store';
import { openTopics } from '@/state/topics';
import { makeStyles } from '@/theme/theme';
import { space } from '@/theme/tokens';

export const TOPIC_NAME_MAX = 40;

// Ids are made in event handlers (not render), as in Talk.
const newTopicId = () => `p${Date.now()}`;

const count = (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'}`;

/** The Journal's Topics view: open topics, a collapsed Resolved section, and a way to add one. */
export function TopicsList() {
  const styles = useStyles();
  const { state, dispatch } = useStore();
  const open = openTopics(state);
  const resolved = state.topics.filter((t) => t.status === 'resolved');
  const [showResolved, setShowResolved] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const trimmed = name.trim();

  const close = () => {
    setAdding(false);
    setName('');
  };
  const add = () => {
    if (!trimmed) return;
    dispatch({ type: 'addTopic', topic: { id: newTopicId(), name: trimmed, status: 'open', createdAt: new Date().toISOString(), entryIds: [] } });
    close();
  };

  return (
    <View style={styles.root}>
      {state.topics.length === 0 ? (
        <StateView title="No topics yet" body="Topics are the things you keep coming back to. Save one from an entry, or add it here." />
      ) : (
        <>
          {open.length === 0 && <Text variant="bodyMuted">Nothing open right now.</Text>}
          {open.map((t) => (
            <TopicRow key={t.id} topic={t} />
          ))}
          {resolved.length > 0 && (
            <>
              <Button
                variant="text"
                label={`Resolved (${resolved.length})`}
                trailingIcon={showResolved ? 'chevron-up' : 'chevron-down'}
                accessibilityHint={showResolved ? 'Hides resolved topics' : 'Shows resolved topics'}
                onPress={() => setShowResolved((v) => !v)}
              />
              {showResolved && resolved.map((t) => <TopicRow key={t.id} topic={t} />)}
            </>
          )}
        </>
      )}
      <Button variant="tonal" icon="plus" label="New topic" onPress={() => setAdding(true)} />
      <Dialog visible={adding} title="New topic" body="Name something you keep coming back to." confirmLabel="Add topic" confirmDisabled={!trimmed} onCancel={close} onConfirm={add}>
        <Field label="Topic name" value={name} onChangeText={setName} maxLength={TOPIC_NAME_MAX} autoFocus returnKeyType="done" onSubmitEditing={add} />
      </Dialog>
    </View>
  );
}

function TopicRow({ topic }: { topic: Topic }) {
  const styles = useStyles();
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${topic.name}. ${count(topic.entryIds.length)}${topic.status === 'resolved' ? ', resolved' : ''}. Open topic.`}
        onPress={() => router.push(`/topic/${topic.id}` as Href)}
        style={styles.row}>
        <Text variant="entryTitle">{topic.name}</Text>
        <Text variant="small">{count(topic.entryIds.length)}</Text>
      </Pressable>
    </Card>
  );
}

const useStyles = makeStyles(() => ({
  root: { marginTop: space.md, gap: space.sm },
  row: { minHeight: 48, justifyContent: 'center', paddingVertical: space.xs },
}));
