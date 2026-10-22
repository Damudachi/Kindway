import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiUnavailableNote } from '@/components/ai-unavailable';
import { IconButton } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { Dialog, useSnackbar } from '@/components/feedback';
import { Notice } from '@/components/notice';
import { keyboardBehavior, TopBar, useBottomInset } from '@/components/screen';
import { Text } from '@/components/text';
import { shortDate } from '@/data/dates';
import { SUPPORT_STYLES } from '@/data/sample';
import type { ChatMessage, SupportStyle } from '@/data/types';
import type { FollowUpError } from '@/services/ai';
import { FOLLOW_UP_CONTEXT_TURNS } from '@/services/ai/remote';
import { useFollowUpMode, useSendFollowUp } from '@/state/actions';
import { useStore } from '@/state/demo-store';
import { useRealAi } from '@/state/real-ai';
import { color, radius, space, type } from '@/theme/tokens';

const ERROR_COPY: Record<FollowUpError, string> = {
  failed: 'The reply didn’t come through. Send your message again to try again.',
  rate: 'You’ve reached the limit for AI replies for now. Try again later.',
  offline: 'You’re offline, so nothing was sent. Try again when you’re connected.',
  timeout: 'The AI took too long to answer. Nothing was saved; try again.',
  unavailable: 'The AI service couldn’t be reached. Try again later.',
  invalid: 'The AI’s reply couldn’t be checked, so it isn’t shown. Try again.',
  consent: 'AI follow-up replies aren’t allowed on this account any more. Nothing was sent.',
  'not-synced': 'This entry hasn’t reached your account yet, so nothing was sent. Check cloud backup and try again.',
  'too-long': 'That message is too long for one reply. Try a shorter one.',
  busy: 'Another AI request is still running. Try again in a moment.',
  safety: 'Kindway didn’t reply to this one. Reaching a real person matters more right now.',
  'conversation-changed': 'Earlier messages here were cleared or deleted from your account. Clear this conversation to start fresh.',
};

/**
 * Entry-linked follow-up conversation. With follow-up consent, replies come from the real AI
 * service; otherwise they are simulated, pre-written on the device. Each reply says which.
 */
export default function Talk() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useStore();
  const insets = useSafeAreaInsets();
  const entry = state.entries.find((e) => e.id === id);
  const messages = state.chats[id] ?? [];
  const [text, setText] = useState('');
  const [style, setStyle] = useState<SupportStyle>(entry?.reflection?.style ?? state.supportStyle);
  const [thinking, setThinking] = useState(false);
  const [failed, setFailed] = useState<FollowUpError | null>(null);
  const sendFollowUp = useSendFollowUp();
  const mode = useFollowUpMode();
  const real = useRealAi();
  const snack = useSnackbar();
  const [confirmClear, setConfirmClear] = useState(false);
  const list = useRef<FlatList<ChatMessage>>(null);
  const bottom = useBottomInset(insets.bottom);

  const send = () => {
    const body = text.trim();
    if (!body || thinking || !entry) return;
    setText('');
    setFailed(null);
    setThinking(true);
    sendFollowUp(entry, body, style, (error) => {
      setThinking(false);
      setFailed(error ?? null);
      if (error === 'safety') router.push('/support');
    });
  };

  const clear = () => {
    const hadAi = messages.some((m) => m.source === 'ai');
    dispatch({ type: 'chat', entryId: id, messages: [] });
    setFailed(null);
    setConfirmClear(false);
    if (hadAi && real.outputs) {
      real.outputs
        .deleteConversation(id)
        .catch(() => snack({ message: 'Cleared here, but it couldn’t be deleted from your account yet. You can delete all AI outputs in AI processing settings.' }));
    }
  };

  const title = entry?.title ? ` (“${entry.title}”)` : '';

  return (
    <KeyboardAvoidingView behavior={keyboardBehavior} style={[styles.root, { paddingTop: insets.top }]}>
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
            {mode === 'ai' ? (
              <Notice title="Sent to GroqCloud with each message">
                Your message, this entry{title} with its tags and good thing, its AI reflection if it has one, and up to the last {FOLLOW_UP_CONTEXT_TURNS} AI replies here. Other
                entries aren’t sent.
              </Notice>
            ) : (
              <Notice title="Context for this conversation">
                Only this entry{title} and its reflection. Other entries aren’t searched. Replies here are simulated: pre-written by style, not generated from your words.
              </Notice>
            )}
            {mode === 'simulated' && <AiUnavailableNote scope="follow_up" />}
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
          <View
            style={[styles.bubble, item.from === 'me' ? styles.me : styles.them]}
            accessibilityLabel={`${item.from === 'me' ? 'You' : item.source === 'ai' ? 'AI reply' : 'Simulated reply'}: ${item.text}`}>
            <Text variant={item.from === 'me' ? 'body' : 'entry'} style={item.from === 'me' ? { color: color.onTrailContainer } : styles.themText}>
              {item.text}
            </Text>
            {item.from === 'kindway' && (
              <Text variant="labelSmall" style={styles.source}>
                {item.source === 'ai' ? 'Written by AI' : 'Simulated reply'}
              </Text>
            )}
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
                Your message is kept here. {ERROR_COPY[failed]}
              </Notice>
            )}
            <Text variant="small">
              {mode === 'ai'
                ? 'AI replies are written by openai/gpt-oss-120b on GroqCloud, not by a person, and can be wrong. Kindway is a reflection aid, not a therapist.'
                : 'Simulated replies: pre-written by style, not generated from your words. Kindway is a reflection aid, not a therapist.'}
            </Text>
          </View>
        }
      />
      <View style={[styles.composer, { paddingBottom: space.sm + bottom }]}>
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
        body="The follow-up messages will be removed from this device and, for AI replies, from your account. The entry and its reflection stay."
        confirmLabel="Clear"
        destructive
        onCancel={() => setConfirmClear(false)}
        onConfirm={clear}
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
  source: { marginTop: space.xxs, color: color.inkMuted },
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
