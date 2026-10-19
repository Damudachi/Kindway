import { router } from 'expo-router';

import { Composer } from '@/components/composer';
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
          router.replace('/today');
        }
      }}
    />
  );
}
