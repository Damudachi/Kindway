import type { CompassValue, Entry } from '@/data/types';
import { longDate } from '@/data/dates';
import { onWeb } from '@/services/platform';

/**
 * "Export my journal": your own words as one Markdown file, made on this device and handed to
 * the share sheet (or downloaded on the web). Nothing is uploaded. Reflections, conversations
 * and sample entries are left out.
 */

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const pad = (n: number) => String(n).padStart(2, '0');

/** The journal as Markdown, oldest entry first. */
export function journalMarkdown(entries: Entry[], compass: CompassValue[], at: Date): string {
  const mine = entries.filter((e) => !e.sample).sort((a, b) => a.date.localeCompare(b.date));
  const areas = new Map(compass.map((c) => [c.id, c.area]));
  const head = `# Kindway journal\n\nExported ${longDate(at.toISOString())} · ${mine.length} ${mine.length === 1 ? 'entry' : 'entries'}\n`;
  const parts = mine.map((e) => {
    const tags = [
      e.feelings.length ? `Feelings: ${e.feelings.join(', ')}` : '',
      (e.compassIds ?? []).some((id) => areas.has(id)) ? `Compass: ${(e.compassIds ?? []).flatMap((id) => areas.get(id) ?? []).join(', ')}` : '',
    ].filter(Boolean);
    return [`## ${longDate(e.date)} · ${time(e.date)}`, `### ${e.title}`, tags.join(' · '), e.body, e.gratitude ? `One good thing: ${e.gratitude}` : '']
      .filter(Boolean)
      .join('\n\n');
  });
  return [head, ...parts].join('\n\n') + '\n';
}

/** kindway-journal-YYYY-MM-DD.md, from the local date. */
export function exportFileName(at: Date): string {
  return `kindway-journal-${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}.md`;
}

/**
 * Hands the file to the person. Throws if it can't. On the web, navigator.share needs the
 * click's user gesture, so nothing is awaited before it.
 */
export async function shareJournal(markdown: string, fileName: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (onWeb()) return shareOnWeb(markdown, fileName);
  // Loaded here, not at the top, so Jest and the web build never import the native modules.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native module
  const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native module
  const Sharing = require('expo-sharing') as typeof import('expo-sharing');
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  await file.write(markdown);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/markdown', dialogTitle: 'Export your journal' });
  return 'shared';
}

async function shareOnWeb(markdown: string, fileName: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([markdown], fileName, { type: 'text/markdown' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return 'cancelled';
      throw e;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  // Revoked a moment later so the browser has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}
