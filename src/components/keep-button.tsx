import { IconButton } from '@/components/button';
import type { KeptWord } from '@/data/types';
import { useStore } from '@/state/demo-store';

/** Matches the length the account sync accepts for a kept line. */
const KEPT_MAX = 1200;

let sequence = 0;
// Made in the press handler (not render); the counter keeps two keeps in one millisecond apart.
const keptId = () => `k${Date.now()}${(sequence++ % 1000).toString(36)}`;

const sameSource = (a: KeptWord['source'], b: KeptWord['source']) =>
  a.kind === 'topic' ? b.kind === 'topic' && a.topicId === b.topicId : b.kind === a.kind && 'entryId' in b && a.entryId === b.entryId;

/** A heart that keeps (or lets go of) these exact words from this source. */
export function KeepButton({ text, source }: { text: string; source: KeptWord['source'] }) {
  const { state, dispatch } = useStore();
  const clean = text.trim().slice(0, KEPT_MAX);
  const existing = state.kept.find((k) => k.text === clean && sameSource(k.source, source));
  if (!clean) return null;
  return (
    <IconButton
      icon={existing ? 'heart' : 'heart-outline'}
      label={existing ? 'Kept. Tap to remove' : 'Keep these words'}
      selected={!!existing}
      onPress={() => dispatch(existing ? { type: 'unkeep', id: existing.id } : { type: 'keep', word: { id: keptId(), text: clean, source, createdAt: new Date().toISOString() } })}
    />
  );
}
