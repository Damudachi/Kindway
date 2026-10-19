import { router } from 'expo-router';

import { Composer } from '@/components/composer';

export default function Write() {
  return (
    <Composer
      onSaved={(id, reflected) => {
        // With a reflection, open the entry to watch it arrive; otherwise return to the trail to see the blaze painted.
        if (reflected) router.replace(`/entry/${id}`);
        else router.back();
      }}
    />
  );
}
