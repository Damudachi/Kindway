import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { FlatList, KeyboardAvoidingView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiConsentDialog } from '@/components/ai-consent-dialog';
import { IconButton } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { Dialog, useSnackbar } from '@/components/feedback';
import { Illustration } from '@/components/illustrations';
import { KeepButton } from '@/components/keep-button';
import { Notice, StateView } from '@/components/notice';
import { keyboardBehavior, Screen, TopBar, useBottomInset } from '@/components/screen';
import { Text } from '@/components/text';
import { SUPPORT_STYLES } from '@/data/sample';
import type { ChatMessage, SupportStyle } from '@/data/types';
import type { FollowUpError } from '@/services/ai';
import { FOLLOW_UP_CONTEXT_TURNS } from '@/services/ai/remote';
import { useSendTopicTalk } from '@/state/actions';
import { useStore } from '@/state/demo-store';
import { useAiBlocker, useRealAi } from '@/state/real-ai';
import { makeStyles, useTheme } from '@/theme/theme';
import { radius, space } from '@/theme/tokens';

const ERROR_COPY: Record<FollowUpError, string> = {
  failed: 'The reply didn’t come through. Send your message again to try again.',
  rate: 'You’ve reached the limit for AI replies for now. Try again later.',
  offline: 'You’re offline, so nothing was sent. Try again when you’re connected.',
  timeout: 'The AI took too long to answer. Nothing was saved; try again.',
  unavailable: 'The AI service couldn’t be reached. Try again later.',
  invalid: 'The AI’s reply couldn’t be checked, so it isn’t shown. Try again.',
  consent: 'AI conversations about topics aren’t allowed on this account any more. Nothing was sent.',
  'not-synced': 'This topic or its entries haven’t reached your account yet, so nothing was sent. Check cloud backup and try again.',
  'too-long': 'That message is too long for one reply. Try a shorter one.',
  busy: 'Another AI request is still running. Try again in a moment.',
  safety: 'Kindway didn’t reply to this one. Reaching a real person matters more right now.',
  'conversation-changed': 'Earlier messages here were cleared or deleted from your account. Clear this conversation to start fresh.',
};

const askedId = () => `q${Date.now()}`;

/**
 * Conversation about a whole topic. Replies come from real AI only, and need the same permission
 * as reviews across entries, since several entries are read. Without it, sending asks for it
 * and sends nothing until it's given.
 */
export default function TopicTalk() {
  const styles = useStyles();
  const { color } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useStore();
  const insets = useSafeAreaInsets();
  const topic = state.topics.find((t) => t.id === id);
  const messages = state.topicChats[id] ?? [];
  const [text, setText] = useState('');
  const [style, setStyle] = useState<SupportStyle>(state.supportStyle);
  const [thinking, setThinking] = useState(false);
  const [failed, setFailed] = useState<FollowUpError | null>(null);
  const sendTopicTalk = useSendTopicTalk();
  const real = useRealAi();
  const blocker = useAiBlocker('cross_entry_analysis');
  const snack = useSnackbar();
  const [confirmClear, setConfirmClear] = useState(false);
  const [asking, setAsking] = useState(false);
  const list = useRef<FlatList<ChatMessage>>(null);
  const bottom = useBottomInset(insets.bottom);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  // The question Kindway asked that the next message answers; kept until a message is really sent.
  // Coming back to a chat that ends with Kindway's question picks it up again.
  const [pendingAsk, setPendingAsk] = useState<string | undefined>(() => {
    const last = messages[messages.length - 1];
    return last?.asked ? last.text : undefined;
  });
  // Bumped when the conversation is cleared, so a late failure can't bring back a question that is gone.
  const cleared = useRef(0);
  const ai = real.insights;
  const latest = messages[messages.length - 1];
  // Chips belong to the newest message only, and only when it is a real AI reply.
  const chips = latest?.from === 'kindway' && latest.source === 'ai' && latest.ai ? (latest.questions ?? []) : [];

  if (!topic) {
    return (
      <Screen top={{ back: true }}>
        <StateView title="Topic not found" body="This topic isn’t here any more." />
      </Screen>
    );
  }

  const postQuestion = (question: string) => {
    if (!(latest?.asked && latest.text === question)) {
      dispatch({ type: 'appendTopicChat', topicId: topic.id, messages: [{ id: askedId(), from: 'kindway', text: question, source: 'ai', asked: true }] });
    }
    setPendingAsk(question);
    input.current?.focus();
  };

  /** `consentJustGiven`: the account recorded the consent before the app re-read it. */
  const send = (consentJustGiven = false) => {
    const body = text.trim();
    if (!body || thinking) return;
    if (!ai && !consentJustGiven) {
      if (blocker === 'consent-loading') snack({ message: 'Still checking your AI choices. Try again in a moment.' });
      else setAsking(true);
      return;
    }
    const asked = pendingAsk;
    const generation = cleared.current;
    setText('');
    setPendingAsk(undefined);
    setFailed(null);
    setThinking(true);
    sendTopicTalk(
      topic,
      body,
      style,
      (error) => {
        setThinking(false);
        setFailed(error ?? null);
        // The message is kept after a failure, so the retry still answers the same question.
        if (error && asked && generation === cleared.current) setPendingAsk(asked);
        if (error === 'safety') router.push('/support');
      },
      consentJustGiven,
      asked,
    );
  };

  const clear = () => {
    const hadAi = messages.some((m) => m.source === 'ai' && !m.asked);
    dispatch({ type: 'topicChat', topicId: topic.id, messages: [] });
    setFailed(null);
    setPendingAsk(undefined);
    cleared.current += 1;
    setConfirmClear(false);
    if (hadAi && real.outputs) {
      real.outputs
        .deleteTopicTalk(topic.id)
        .catch(() => snack({ message: 'Cleared here, but it couldn’t be deleted from your account yet. You can delete all AI outputs in AI processing settings.' }));
    }
  };

  return (
    <KeyboardAvoidingView behavior={keyboardBehavior} style={[styles.root, { paddingTop: insets.top }]}>
      <TopBar
        back
        small
        title={`Talking about · ${topic.name}`}
        actions={<IconButton icon="broom" label="Clear this conversation" onPress={() => setConfirmClear(true)} />}
      />
      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(m) => m.id}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
        // The list gets shorter when the keyboard opens; keep the newest message in view.
        onLayout={() => list.current?.scrollToEnd({ animated: false })}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            {ai ? (
              <Notice title="Sent to GroqCloud with each message">
                Your message, this topic’s name, up to 8 linked entries from the last 90 days (date, tags, first 600 characters), the last {FOLLOW_UP_CONTEXT_TURNS} AI replies here, and your
                support style and challenge settings.
              </Notice>
            ) : (
              <Notice title="Replies here come from real AI">
                You’ll be asked before anything is sent. A message would go with this topic’s name and a few of its linked entries; your other entries aren’t sent.
              </Notice>
            )}
            <Text variant="label" style={styles.styleLabel}>
              Response style
            </Text>
            <ChipRow>
              {SUPPORT_STYLES.map((s) => (
                <Chip key={s.id} label={s.title} selected={style === s.id} onPress={() => setStyle(s.id)} />
              ))}
            </ChipRow>
            {messages.length === 0 && (
              <View style={styles.empty}>
                <Illustration name="talk" />
                <Text variant="bodyMuted">Ask anything about this topic, or just keep writing. You can stop whenever you like.</Text>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View
            style={[styles.bubble, item.from === 'me' ? styles.me : styles.them]}
            accessibilityLabel={`${item.from === 'me' ? 'You' : item.asked ? 'Kindway asked' : 'AI reply'}: ${item.text}`}>
            <Text variant={item.from === 'me' ? 'body' : 'entry'} style={item.from === 'me' ? { color: color.onTrailContainer } : styles.themText}>
              {item.text}
            </Text>
            {item.from === 'kindway' && (
              <View style={styles.sourceRow}>
                <Text variant="labelSmall" style={styles.source}>
                  {item.asked ? 'Kindway asked' : 'Written by AI'}
                </Text>
                {item.source === 'ai' && item.ai && !item.asked && <KeepButton text={item.text} source={{ kind: 'topic', topicId: topic.id }} />}
              </View>
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
            {chips.length > 0 && (
              <ChipRow>
                {chips.map((q, i) => (
                  <Chip key={`${i}:${q}`} kind="assist" icon="forum-outline" label={q} accessibilityHint="Opens the conversation with this question" onPress={() => postQuestion(q)} />
                ))}
              </ChipRow>
            )}
            <Text variant="small">
              {ai
                ? 'AI replies are written by openai/gpt-oss-120b on GroqCloud, not by a person, and can be wrong. Kindway is a reflection aid, not a therapist.'
                : 'Once allowed, replies are written by AI, not by a person, and can be wrong. Kindway is a reflection aid, not a therapist.'}
            </Text>
          </View>
        }
      />
      <View style={[styles.composer, { paddingBottom: space.sm + bottom }]}>
        <TextInput
          ref={input}
          value={text}
          onChangeText={setText}
          placeholder="Ask about this topic"
          placeholderTextColor={color.pencil}
          cursorColor={color.trail}
          accessibilityLabel="Topic message"
          multiline
          style={styles.input}
        />
        <IconButton icon="send" label="Send message" tint={text.trim() ? color.trail : color.outline} onPress={() => send()} />
      </View>
      <AiConsentDialog
        scope="cross_entry_analysis"
        context="topic"
        blocker={asking && blocker && blocker !== 'consent-loading' ? blocker : null}
        onCancel={() => setAsking(false)}
        onAllowed={() => {
          setAsking(false);
          send(true);
        }}
        onGrantFailed={() => snack({ message: 'Couldn’t record that. Nothing was sent; your message is still here. Try again when you’re online.' })}
      />
      <Dialog
        visible={confirmClear}
        title="Clear this conversation?"
        body="The messages will be removed from this device and, for AI replies, from your account. The topic and its entries stay."
        confirmLabel="Clear"
        destructive
        onCancel={() => setConfirmClear(false)}
        onConfirm={clear}
      />
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((color, type) => ({
  root: { flex: 1, backgroundColor: color.paper },
  list: { paddingHorizontal: space.gutter, paddingBottom: space.lg, gap: space.sm },
  header: { gap: space.xs, marginBottom: space.sm },
  styleLabel: { marginTop: space.sm },
  empty: { marginTop: space.md, gap: space.sm },
  bubble: { maxWidth: '88%', borderRadius: radius.lg, padding: space.md },
  me: { alignSelf: 'flex-end', backgroundColor: color.trailContainer, borderBottomRightRadius: 4 },
  them: { alignSelf: 'flex-start', backgroundColor: color.raised, borderWidth: 1, borderColor: color.sand, borderBottomLeftRadius: 4 },
  themText: { fontSize: 17, lineHeight: 26 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.xs, marginTop: space.xxs },
  source: { color: color.inkMuted, flexShrink: 1 },
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
}));
