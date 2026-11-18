import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button, IconButton } from '@/components/button';
import { Card } from '@/components/card';
import { Field } from '@/components/controls';
import { Dialog } from '@/components/feedback';
import { StateView } from '@/components/notice';
import { ResolveTopicDialog } from '@/components/resolve-topic-dialog';
import { goBack, Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { TOPIC_NAME_MAX } from '@/components/topics-list';
import { relativeDay } from '@/data/dates';
import { useEntries, useStore } from '@/state/demo-store';
import { makeStyles } from '@/theme/theme';
import { space } from '@/theme/tokens';

/** C8 turns this on: a conversation about the whole topic. */
const TALK_ABOUT_THIS = false;

export default function TopicPage() {
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useStore();
  const visible = useEntries();
  const topic = state.topics.find((t) => t.id === id);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [resolving, setResolving] = useState(false);

  if (!topic) {
    return (
      <Screen top={{ back: true }}>
        <StateView title="Topic not found" body="This topic isn’t here any more." action={<Button variant="secondary" label="Back to Journal" onPress={goBack} />} />
      </Screen>
    );
  }

  // Newest first; `useEntries` already hides entries that are waiting to be deleted.
  const linked = visible.filter((e) => topic.entryIds.includes(e.id));
  const resolved = topic.status === 'resolved';
  const draftName = draft.trim();

  const saveName = () => {
    if (!draftName) return;
    dispatch({ type: 'updateTopic', id: topic.id, patch: { name: draftName } });
    setRenaming(false);
  };

  return (
    <Screen
      top={{
        back: true,
        title: topic.name,
        actions: <IconButton icon="dots-vertical" label="Topic options" selected={menu} onPress={() => setMenu((v) => !v)} />,
      }}>
      {menu && (
        <Card>
          <Button
            variant="text"
            icon="pencil-outline"
            label="Rename"
            onPress={() => {
              setMenu(false);
              setDraft(topic.name);
              setRenaming(true);
            }}
          />
          <Button
            variant="dangerText"
            icon="trash-can-outline"
            label="Delete"
            onPress={() => {
              setMenu(false);
              setDeleting(true);
            }}
          />
        </Card>
      )}

      {resolved && (
        <Card style={styles.block}>
          <Text variant="labelSmall">Resolved</Text>
          <Text variant="body">{topic.whatHelped || 'Chapter closed.'}</Text>
        </Card>
      )}

      <Text variant="label" style={styles.heading}>
        {linked.length === 0 ? 'No entries yet' : linked.length === 1 ? '1 entry' : `${linked.length} entries`}
      </Text>
      <View style={styles.list}>
        {linked.map((e) => (
          <Card key={e.id}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${relativeDay(e.date)}: ${e.title}. Open entry.`} onPress={() => router.push(`/entry/${e.id}`)} style={styles.row}>
              <Text variant="labelSmall">{relativeDay(e.date)}</Text>
              <Text variant="entryTitle">{e.title}</Text>
            </Pressable>
          </Card>
        ))}
      </View>

      {TALK_ABOUT_THIS && <Button variant="tonal" label="Talk about this" onPress={() => router.push(`/topic/${topic.id}/talk` as Href)} />}
      {resolved ? (
        <Button variant="secondary" label="Reopen" onPress={() => dispatch({ type: 'reopenTopic', id: topic.id })} />
      ) : (
        <Button variant="secondary" label="Resolve" onPress={() => setResolving(true)} />
      )}

      <Dialog visible={renaming} title="Rename topic" body="Up to 40 characters." confirmLabel="Save name" confirmDisabled={!draftName} onCancel={() => setRenaming(false)} onConfirm={saveName}>
        <Field label="Topic name" value={draft} onChangeText={setDraft} maxLength={TOPIC_NAME_MAX} autoFocus returnKeyType="done" onSubmitEditing={saveName} />
      </Dialog>
      <Dialog
        visible={deleting}
        title="Delete topic?"
        body="Delete this topic? Its entries stay in your journal."
        confirmLabel="Delete topic"
        destructive
        onCancel={() => setDeleting(false)}
        onConfirm={() => {
          setDeleting(false);
          dispatch({ type: 'deleteTopic', id: topic.id });
          goBack();
        }}
      />
      <ResolveTopicDialog
        visible={resolving}
        onCancel={() => setResolving(false)}
        onResolve={(whatHelped) => {
          setResolving(false);
          dispatch({ type: 'resolveTopic', id: topic.id, whatHelped: whatHelped || undefined });
        }}
      />
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  block: { marginTop: space.sm, gap: space.xxs },
  heading: { marginTop: space.md },
  list: { marginTop: space.xs, marginBottom: space.md, gap: space.sm },
  row: { minHeight: 48, justifyContent: 'center', paddingVertical: space.xs },
}));
