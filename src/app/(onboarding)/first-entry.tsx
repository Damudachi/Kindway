import { router } from 'expo-router';

import { Composer } from '@/components/composer';
import { onWeb } from '@/services/platform';
import { useStore } from '@/state/demo-store';

export default function FirstEntry() {
  const { dispatch } = useStore();
  return (
    <Composer
      first
      onSaved={(id, reflected) => {
        if (reflected) {
          router.replace(`/first-reflection?id=${id}`);
        } else {
          dispatch({ type: 'patch', patch: { onboarded: true } });
          // The web has no reminder step yet.
          router.replace(onWeb() ? '/today' : '/reminders-setup');
        }
      }}
      onSkip={() => {
        dispatch({ type: 'patch', patch: { onboarded: true } });
        router.replace('/today');
      }}
    />
  );
}
