import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { Dialog, useSnackbar } from '@/components/feedback';
import { FollowUpConsentDialog } from '@/components/follow-up-consent-dialog';
import { Notice } from '@/components/notice';
import { keyboardBehavior, TopBar, useBottomInset } from '@/components/screen';
import { Illustration } from '@/components/illustrations';
import { Text } from '@/components/text';
import { shortDate } from '@/data/dates';
import { SUPPORT_STYLES } from '@/data/sample';
import type { ChatMessage, SupportStyle } from '@/data/types';
import type { FollowUpError } from '@/services/ai';
import { FOLLOW_UP_CONTEXT_TURNS } from '@/services/ai/remote';
import { useFollowUpMode, useSendFollowUp } from '@/state/actions';
import { useStore } from '@/state/demo-store';
import { fitStep } from '@/state/tomorrow';
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
  consent: 'AI follow-up replies aren’t allowed on this account any more. Nothing was sent.',
  'not-synced': 'This entry hasn’t reached your account yet, so nothing was sent. Check cloud backup and try again.',
  'too-long': 'That message is too long for one reply. Try a shorter one.',
  busy: 'Another AI request is still running. Try again in a moment.',
  safety: 'Kindway didn’t reply to this one. Reaching a real person matters more right now.',
  'conversation-changed': 'Earlier messages here were cleared or deleted from your account. Clear this conversation to start fresh.',
};

/**
 * Entry-linked follow-up conversation. Replies come from the real AI service. Without follow-up
 * consent, sending asks for it (or for the account and cloud backup it needs) and sends nothing
 * until it's given. Simulated replies from before are still shown, labelled as simulated.
 */
export default function Talk() {
  const styles = useStyles();
  const { color } = useTheme();
  // `topic`: one of the other topics a reflection named, to start the conversation on.
  const { id, topic } = useLocalSearchParams<{ id: string; topic?: string }>();
  const { state, dispatch } = useStore();
  const insets = useSafeAreaInsets();
  const entry = state.entries.find((e) => e.id === id);
  const messages = state.chats[id] ?? [];
  const [text, setText] = useState(topic ? `Can we talk about ${topic}?` : '');
  const [style, setStyle] = useState<SupportStyle>(entry?.reflection?.style ?? state.supportStyle);
  const [thinking, setThinking] = useState(false);
  const [failed, setFailed] = useState<FollowUpError | null>(null);
  const sendFollowUp = useSendFollowUp();
  const mode = useFollowUpMode();
  const real = useRealAi();
  const blocker = useAiBlocker('follow_up');
  const snack = useSnackbar();
  const [confirmClear, setConfirmClear] = useState(false);
  const [asking, setAsking] = useState(false);
  const list = useRef<FlatList<ChatMessage>>(null);
  const bottom = useBottomInset(insets.bottom);

  /** `consentJustGiven`: the account recorded follow-up consent before the app re-read it. */
  const send = (consentJustGiven = false) => {
    const body = text.trim();
    if (!body || thinking || !entry) return;
    if (mode !== 'ai' && !consentJustGiven) {
      if (blocker === 'consent-loading') snack({ message: 'Still checking your AI choices. Try again in a moment.' });
      else setAsking(true);
      return;
    }
    setText('');
    setFailed(null);
    setThinking(true);
    sendFollowUp(
      entry,
      body,
      style,
      (error) => {
        setThinking(false);
        setFailed(error ?? null);
        if (error === 'safety') router.push('/support');
      },
      consentJustGiven,
    );
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
        small
        title={entry ? `Talking through · ${shortDate(entry.date)}` : 'Talking through'}
        actions={<IconButton icon="broom" label="Clear this conversation" onPress={() => setConfirmClear(true)} />}
      />
      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(m) => m.id}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
        // The list gets shorter when the keyboard opens; keep the newest message in view.
        onLayout={() => list.current?.scrollToEnd({ animated: false })}
        // Style chips and other controls work on the first tap while typing.
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            {mode === 'ai' ? (
              <Notice title="Sent to GroqCloud with each message">
                Your message, this entry{title} with its tags and good thing, its AI reflection if it has one, and up to the last {FOLLOW_UP_CONTEXT_TURNS} AI replies here. Other
                entries aren’t sent.
              </Notice>
            ) : (
              <Notice title="Replies here come from real AI">
                You’ll be asked before anything is sent. Only this entry{title}, its reflection and this conversation would be sent; other entries aren’t.
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
                <Text variant="bodyMuted">Ask anything about this entry, or just keep writing. You can stop whenever you like.</Text>
              </View>
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
            {item.step && <StepOffer step={item.step} entryId={id} />}
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
                : 'Once allowed, replies are written by AI, not by a person, and can be wrong. Kindway is a reflection aid, not a therapist.'}
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
        <IconButton icon="send" label="Send follow-up" tint={text.trim() ? color.trail : color.outline} onPress={() => send()} />
      </View>
      <FollowUpConsentDialog
        blocker={asking && blocker !== 'consent-loading' ? blocker : null}
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
        body="The follow-up messages will be removed from this device and, for AI replies, from your account. The entry and its reflection stay."
        confirmLabel="Clear"
        destructive
        onCancel={() => setConfirmClear(false)}
        onConfirm={clear}
      />
    </KeyboardAvoidingView>
  );
}

/**
 * A step an AI reply offered, which the user can take to Tomorrow Bridge. Only the reply's
 * structured step qualifies; nothing is read out of the reply text, and nothing is saved here.
 */
function StepOffer({ step, entryId }: { step: string; entryId: string }) {
  const styles = useStyles();
  const { state } = useStore();
  const t = state.tomorrow;
  const saved = t?.status === 'open' && t.source?.kind === 'reflection' && t.source.entryId === entryId && t.text === fitStep(step).text;
  return (
    <View style={styles.step}>
      <Text variant="labelSmall">If you want a next step</Text>
      <Text variant="pencil">{step}</Text>
      {saved ? (
        <Text variant="small">Saved to Tomorrow Bridge.</Text>
      ) : (
        <Button
          variant="tonal"
          label="Save to Tomorrow Bridge"
          accessibilityHint="Opens Tomorrow Bridge with this step filled in. You can edit it, and nothing is saved until you choose to."
          onPress={() => router.push({ pathname: '/tomorrow', params: { suggestion: step, basis: 'talk', about: entryId, use: '1' } })}
        />
      )}
    </View>
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
  source: { marginTop: space.xxs, color: color.inkMuted },
  step: { marginTop: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: color.sand, gap: space.xxs },
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
