import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { Composer } from '@/components/composer';
import { useStore } from '@/state/demo-store';

export default function Write() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const { state, dispatch } = useStore();

  // An edit left unfinished earlier shouldn't turn a new entry into an edit. The saved entry is untouched.
  useEffect(() => {
    if (!edit && state.draft.editingId) dispatch({ type: 'clearDraft' });
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Composer
      onSaved={(id, reflected) => {
        // With a reflection, open the entry to watch it arrive; otherwise return to where writing started.
        if (reflected) router.replace(`/entry/${id}`);
        else router.back();
      }}
    />
  );
}
