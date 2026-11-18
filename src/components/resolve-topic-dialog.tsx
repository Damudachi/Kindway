import { useState } from 'react';

import { Field } from '@/components/controls';
import { Dialog } from '@/components/feedback';

export const WHAT_HELPED_MAX = 200;

type Props = { visible: boolean; onCancel: () => void; onResolve: (whatHelped: string) => void };

/** Closing a topic: a quiet moment to say, if you like, what helped. */
export function ResolveTopicDialog({ visible, onCancel, onResolve }: Props) {
  const [text, setText] = useState('');
  const close = () => {
    setText('');
    onCancel();
  };
  return (
    <Dialog
      visible={visible}
      title="Chapter closed."
      body="Anything that helped is worth keeping. This part is optional."
      confirmLabel="Mark resolved"
      onCancel={close}
      onConfirm={() => {
        const words = text.trim();
        setText('');
        onResolve(words);
      }}>
      <Field label="What helped?" value={text} onChangeText={setText} maxLength={WHAT_HELPED_MAX} multiline />
    </Dialog>
  );
}
