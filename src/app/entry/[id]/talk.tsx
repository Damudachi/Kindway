import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { Dialog } from '@/components/feedback';
import { Notice } from '@/components/notice';
import { TopBar } from '@/components/screen';
import { Text } from '@/components/text';
import { shortDate } from '@/data/dates';
import { SUPPORT_STYLES } from '@/data/sample';
import type { ChatMessage, SupportStyle } from '@/data/types';
import { useSendFollowUp } from '@/state/actions';
import { useStore } from '@/state/demo-store';
import { color, radius, space, type } from '@/theme/tokens';

/** Entry-linked follow-up chat. Replies come from the mock conversation service; no AI is connected. */
export default function Talk() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useStore();
  const insets = useSafeAreaInsets();
  const entry = state.entries.find((e) => e.id === id);
  const messages = state.chats[id] ?? [];
  const [text, setText] = useState('');
  const [style, setStyle] = useState<SupportStyle>(entry?.reflection?.style ?? state.supportStyle);
  const [thinking, setThinking] = useState(false);
  const [failed, setFailed] = useState(false);
  const sendFollowUp = useSendFollowUp();
  const [confirmClear, setConfirmClear] = useState(false);
  const list = useRef<FlatList<ChatMessage>>(null);

  const send = () => {
    const body = text.trim();
    if (!body || thinking || !entry) return;
    setText('');
    setFailed(false);
    setThinking(true);
    sendFollowUp(entry, body, style, (error) => {
      setThinking(false);
      setFailed(!!error);
    });
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.root, { paddingTop: insets.top }]}>
      <TopBar
        back
        title={entry ? `Talking through · ${shortDate(entry.date)}` : 'Talking through'}
        actions={<IconButton icon="broom" label="Clear this conversation" onPress={() => setConfirmClear(true)} />}
      />
      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(m) => m.id}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Notice title="Context for this conversation">
              Only this entry{entry?.title ? ` (“${entry.title}”)` : ''} and its reflection. Other entries aren’t searched.
            </Notice>
            <Text variant="label" style={styles.styleLabel}>
              Response style
            </Text>
            <ChipRow>
              {SUPPORT_STYLES.map((s) => (
                <Chip key={s.id} label={s.title} selected={style === s.id} onPress={() => setStyle(s.id)} />
              ))}
            </ChipRow>
            {messages.length === 0 && (
              <Text variant="bodyMuted" style={styles.empty}>
                Ask anything about this entry, or just keep writing. You can stop whenever you like.
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.from === 'me' ? styles.me : styles.them]} accessibilityLabel={`${item.from === 'me' ? 'You' : 'Kindway'}: ${item.text}`}>
            <Text variant={item.from === 'me' ? 'body' : 'entry'} style={item.from === 'me' ? { color: color.onTrailContainer } : styles.themText}>
              {item.text}
            </Text>
          </View>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            {thinking && (
              <Text variant="pencil" accessibilityLiveRegion="polite">
                Kindway is writing…
              </Text>
            )}
            {failed && (
              <Notice tone="warn" title="No reply this time">
                Your message is saved here. The simulated reply didn’t come through; send another message to try again.
              </Notice>
            )}
            <Text variant="small">Simulated replies: pre-written by style, not generated from your words. Kindway is a reflection aid, not a therapist.</Text>
          </View>
        }
      />
      <View style={[styles.composer, { paddingBottom: space.sm + insets.bottom }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Ask a follow-up"
          placeholderTextColor={color.pencil}
          cursorColor={color.trail}
          accessibilityLabel="Follow-up message"
          multiline
          style={styles.input}
        />
        <IconButton icon="send" label="Send follow-up" tint={text.trim() ? color.trail : color.outline} onPress={send} />
      </View>
      <Dialog
        visible={confirmClear}
        title="Clear this conversation?"
        body="The follow-up messages will be removed. The entry and its reflection stay."
        confirmLabel="Clear"
        destructive
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          dispatch({ type: 'chat', entryId: id, messages: [] });
          setConfirmClear(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper },
  list: { paddingHorizontal: space.gutter, paddingBottom: space.lg, gap: space.sm },
  header: { gap: space.xs, marginBottom: space.sm },
  styleLabel: { marginTop: space.sm },
  empty: { marginTop: space.md },
  bubble: { maxWidth: '88%', borderRadius: radius.lg, padding: space.md },
  me: { alignSelf: 'flex-end', backgroundColor: color.trailContainer, borderBottomRightRadius: 4 },
  them: { alignSelf: 'flex-start', backgroundColor: color.raised, borderWidth: 1, borderColor: color.sand, borderBottomLeftRadius: 4 },
  themText: { fontSize: 17, lineHeight: 26 },
  footer: { gap: space.xs, marginTop: space.sm },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: color.sand,
    backgroundColor: color.paper,
  },
  input: {
    ...type.body,
    flex: 1,
    minHeight: 48,
    maxHeight: 140,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.outline,
    backgroundColor: color.raised,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
});
