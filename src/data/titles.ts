/** The longest title an entry can have, whoever wrote it. */
export const TITLE_MAX = 60;

const WORDS = 6;

/**
 * The title an entry gets on the device: its first sentence, or the start of it with an
 * ellipsis when it runs long. An AI reflection may replace it with a better one later.
 */
export function titleFrom(text: string) {
  const first = (text.trim().split(/[.!?\n]/)[0] ?? '').replace(/[,;:\-–—\s]+$/, '');
  const words = first.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'Untitled entry';
  const title = words.slice(0, WORDS).join(' ').replace(/[,;:\-–—]+$/, '');
  const capped = title.charAt(0).toUpperCase() + title.slice(1);
  return words.length > WORDS ? `${capped}…` : capped;
}

/** The title rule before 2026-10-25, so entries saved with it still count as untouched. */
const legacyTitleFrom = (text: string) => {
  const first = text.trim().split(/[.!?\n]/)[0] ?? '';
  const words = first.split(/\s+/).filter(Boolean).slice(0, WORDS).join(' ');
  return words.length > 0 ? words : 'Untitled entry';
};

/** Whether an entry still has the title the device made for it: not renamed, not from AI. */
export const hasAutoTitle = (e: { title: string; body: string }) => e.title === titleFrom(e.body) || e.title === legacyTitleFrom(e.body);
