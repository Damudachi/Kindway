import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { NavRow, RadioRow, Section, SwitchRow } from '@/components/controls';
import { Dialog } from '@/components/feedback';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import type { DemoAi } from '@/data/types';
import { useStore } from '@/state/demo-store';
import { space } from '@/theme/tokens';

const AI_STATES: { id: DemoAi; title: string; detail: string }[] = [
  { id: 'ok', title: 'Everything works', detail: 'Reflections arrive after a short wait.' },
  { id: 'fail', title: 'AI request fails', detail: 'Entry saves; reflection offers retry.' },
  { id: 'rate', title: 'Rate limited', detail: 'Entry saves; reflections pause for a while.' },
  { id: 'offline', title: 'Offline', detail: 'Writing works; AI and sync wait.' },
];

export default function Settings() {
  const { state, dispatch } = useStore();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <Screen top={{ back: true, title: 'Settings' }}>
      <Section first>
        <NavRow icon="creation-outline" title="AI & memory" detail="Support style, challenge, context, saved memory" onPress={() => router.push('/settings/ai-memory')} />
        <NavRow icon="shield-lock-outline" title="Privacy & data" detail="Storage, AI processing, export, deletion" onPress={() => router.push('/settings/privacy')} />
        <NavRow icon="bell-outline" title="Gentle reminders" detail={state.reminders.enabled ? `On · ${state.reminders.time}` : 'Off'} onPress={() => router.push('/settings/reminders')} />
        <NavRow icon="widgets-outline" title="Home-screen widget" detail="Preview and privacy" onPress={() => router.push('/widget')} />
        <NavRow icon="lifebuoy" title="Extra support" detail="When you need more than a journal" onPress={() => router.push('/support')} />
      </Section>

      <Section title="Account">
        <Text variant="body">{state.account ? state.account.email : 'Not signed in'}</Text>
        <Text variant="small">Prototype only: no real account exists and nothing is synced or stored on a server.</Text>
        {state.account && <Button variant="secondary" label="Sign out" onPress={() => setConfirmSignOut(true)} style={styles.gap} />}
      </Section>

      <Section title="Start over">
        <Text variant="body">
          Erase everything this prototype saved on this device: your entries, reflections, compass, preferences, small step and feedback. You’ll see onboarding again.
        </Text>
        <Text variant="small" style={styles.gapSm}>
          Sample insights are fictional and built into the app, so they aren’t part of your data either way.
        </Text>
        <Button variant="danger" label="Reset everything on this device" onPress={() => setConfirmReset(true)} style={styles.gap} />
      </Section>

      <Section title="Preview states">
        <Notice tone="demo">For reviewers: simulate conditions the real backend would produce. These switches only exist in this demo.</Notice>
        <Text variant="label" style={styles.gap}>
          AI reflections
        </Text>
        {AI_STATES.map((s) => (
          <RadioRow key={s.id} title={s.title} detail={s.detail} selected={state.demo.ai === s.id} onPress={() => dispatch({ type: 'demo', patch: { ai: s.id } })} />
        ))}
        <SwitchRow title="Sign-in fails" detail="Account screen shows an error" value={state.demo.signInError} onChange={(signInError) => dispatch({ type: 'demo', patch: { signInError } })} />
        <SwitchRow title="Session expired" detail="Today asks you to sign in again" value={state.demo.sessionExpired} onChange={(sessionExpired) => dispatch({ type: 'demo', patch: { sessionExpired } })} />
        <Button variant="text" label="Open the extra support path" onPress={() => router.push('/support')} />
        <Button variant="text" label="Preview sample insights" onPress={() => router.push('/sample')} />
      </Section>

      <Dialog
        visible={confirmSignOut}
        title="Sign out?"
        body="This only forgets the prototype account. Your entries stay on this device."
        confirmLabel="Sign out"
        onCancel={() => setConfirmSignOut(false)}
        onConfirm={() => {
          setConfirmSignOut(false);
          dispatch({ type: 'patch', patch: { account: null } });
        }}
      />
      <Dialog
        visible={confirmReset}
        title="Reset everything?"
        body="All entries, reflections, conversations, compass values and settings saved on this device will be erased. This can’t be undone."
        confirmLabel="Erase and start over"
        destructive
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          dispatch({ type: 'reset' });
          router.replace('/welcome');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: space.md },
  gapSm: { marginTop: space.xs },
});
