import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useStore } from '@/state/demo-store';
import { makeStyles, useTheme } from '@/theme/theme';
import { radius, space } from '@/theme/tokens';

type Step = 'intro' | 'permission' | 'denied' | 'recording' | 'transcribing' | 'review' | 'failed';

const SAMPLE_TRANSCRIPT =
  "Okay so today was kind of a lot. The presentation went fine I think, but I keep replaying the part where I lost my place. I want to stop doing that.";

/**
 * Voice journaling flow. Nothing is recorded or transcribed in this milestone.
 * TODO(voice): microphone permission via expo-audio, on-device or server transcription, discard raw audio after use.
 */
export default function Voice() {
  const styles = useStyles();
  const { color } = useTheme();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { state, dispatch } = useStore();
  const [step, setStep] = useState<Step>('intro');
  const [transcript, setTranscript] = useState('');
  const [seconds, setSeconds] = useState(0);
  const reduce = useReducedMotion();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (step !== 'recording') return;
    if (!reduce) pulse.value = withRepeat(withTiming(0.4, { duration: 900 }), -1, true);
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      clearInterval(t);
      pulse.value = 1;
    };
  }, [step, reduce, pulse]);

  useEffect(() => {
    if (step !== 'transcribing') return;
    const t = setTimeout(() => {
      if (state.demo.ai === 'fail' || state.demo.ai === 'offline') setStep('failed');
      else {
        setTranscript(SAMPLE_TRANSCRIPT);
        setStep('review');
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [step, state.demo.ai]);

  const dot = useAnimatedStyle(() => ({ opacity: pulse.value }));

  const useTranscript = () => {
    const text = state.draft.text.trim() ? `${state.draft.text.trimEnd()}\n\n${transcript}` : transcript;
    dispatch({ type: 'draft', patch: { text } });
    // Return to the composer it came from, or open one.
    if (from === 'write') router.back();
    else router.replace('/write');
  };

  return (
    <Screen top={{ back: true, title: 'Voice journal' }}>
      <Text variant="headline" accessibilityRole="header">
        Just say what’s on your mind.
      </Text>
      <Text variant="bodyMuted" style={styles.lede}>
        Speak naturally. You’ll read and edit the transcript before it becomes an entry or goes anywhere.
      </Text>

      {step === 'intro' && (
        <View style={styles.block}>
          <Button label="Start recording" icon="microphone-outline" onPress={() => setStep('permission')} />
          <Notice tone="demo" title="Not connected">
            Nothing is recorded or transcribed in this demo. You’ll see sample text instead.
          </Notice>
        </View>
      )}

      {step === 'permission' && (
        <View style={styles.block}>
          <Text variant="title">Kindway needs your microphone</Text>
          <Text variant="body">
            Audio is used only to create the transcript, then discarded. Android will ask you to allow access.
          </Text>
          <Button label="Allow microphone (demo)" onPress={() => setStep('recording')} />
          <Button variant="secondary" label="Don't allow (demo)" onPress={() => setStep('denied')} />
        </View>
      )}

      {step === 'denied' && (
        <View style={styles.block}>
          <Notice tone="warn" title="Microphone access is off">
            You can turn it on in Android settings, or write instead. Nothing you’ve written is affected.
          </Notice>
          <Button variant="secondary" label="Open Android settings (demo)" onPress={() => setStep('permission')} />
          <Button variant="tonal" label="Write instead" onPress={() => router.replace('/write')} />
        </View>
      )}

      {step === 'recording' && (
        <View style={styles.block}>
          <View style={styles.recRow} accessibilityLiveRegion="polite" accessibilityLabel={`Recording, ${seconds} seconds`}>
            <Animated.View style={[styles.recDot, dot]} />
            <Text variant="title">
              {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
            </Text>
            <Text variant="small">Demo: not actually recording</Text>
          </View>
          <Button label="Stop and transcribe" icon="stop" onPress={() => setStep('transcribing')} />
          <Button variant="text" label="Cancel recording" onPress={() => { setSeconds(0); setStep('intro'); }} />
        </View>
      )}

      {step === 'transcribing' && (
        <View style={styles.block} accessibilityLiveRegion="polite">
          <Text variant="label">Turning your words into text…</Text>
        </View>
      )}

      {step === 'failed' && (
        <View style={styles.block}>
          <Notice tone="warn" title="Couldn't transcribe that">
            The recording wasn’t kept. Try again, or write instead.
          </Notice>
          <Button variant="secondary" label="Try again" icon="refresh" onPress={() => { setSeconds(0); setStep('recording'); }} />
          <Button variant="tonal" label="Write instead" onPress={() => router.replace('/write')} />
        </View>
      )}

      {step === 'review' && (
        <View style={styles.block}>
          <Text variant="label">Transcript, edit anything</Text>
          <TextInput
            value={transcript}
            onChangeText={setTranscript}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Transcript"
            cursorColor={color.trail}
            style={styles.transcript}
          />
          <Text variant="small">Sample transcript. The recording has been discarded.</Text>
          <Button label="Use transcript in journal" disabled={!transcript.trim()} onPress={useTranscript} />
          <Button variant="secondary" label="Record again" onPress={() => { setSeconds(0); setStep('recording'); }} />
          <Button variant="text" label="Discard" onPress={() => router.back()} />
        </View>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((color, type) => ({
  lede: { marginTop: space.xs, marginBottom: space.lg },
  block: { gap: space.sm },
  recRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md, flexWrap: 'wrap' },
  recDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: color.danger },
  transcript: {
    ...type.entry,
    minHeight: 180,
    backgroundColor: color.raised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.outline,
    padding: space.md,
  },
}));
