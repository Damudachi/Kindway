import { exportFileName, journalMarkdown } from '@/services/export';
import { entry } from '@/test-utils/entries';

const at = new Date(2026, 9, 30, 12, 0);
const compass = [{ id: 'c1', area: 'Family', note: '', aiMayReference: true }];

describe('journalMarkdown', () => {
  it('puts the oldest entry first even when given newest first', () => {
    const md = journalMarkdown([entry('new', 0, { title: 'Newer' }, at), entry('old', 3, { title: 'Older' }, at)], compass, at);
    expect(md.indexOf('### Older')).toBeGreaterThan(-1);
    expect(md.indexOf('### Older')).toBeLessThan(md.indexOf('### Newer'));
  });

  it('writes the header, then each entry with date, time, title, feelings, compass, body and one good thing', () => {
    const e = entry('a', 0, { title: 'A day', body: 'Words here.', feelings: ['calm', 'tired'], compassIds: ['c1'], gratitude: 'Tea' }, at);
    const md = journalMarkdown([e], compass, at);
    expect(md).toMatch(/^# Kindway journal\n\nExported Friday, October 30 · 1 entry\n/);
    expect(md).toMatch(/## [A-Z][a-z]+day, [A-Z][a-z]+ \d+ · 9:00 PM\n\n### A day\n\nFeelings: calm, tired · Compass: Family\n\nWords here\.\n\nOne good thing: Tea/);
  });

  it('omits the feelings line when there are no feelings or compass areas', () => {
    expect(journalMarkdown([entry('a', 0, {}, at)], compass, at)).not.toContain('Feelings:');
  });

  it('leaves out sample entries', () => {
    const md = journalMarkdown([entry('a', 0, { title: 'Real' }, at), entry('s', 1, { title: 'Fake', sample: true }, at)], compass, at);
    expect(md).toContain('### Real');
    expect(md).not.toContain('Fake');
    expect(md).toContain('· 1 entry');
  });

  it('never includes reflection text', () => {
    const e = entry('a', 0, { reflection: { style: 'listen', acknowledge: 'SECRET-REFLECTION', basedOn: '' }, reflectionStatus: 'ready' }, at);
    expect(journalMarkdown([e], compass, at)).not.toContain('SECRET-REFLECTION');
  });
});

describe('exportFileName', () => {
  it('uses the local date', () => {
    expect(exportFileName(new Date(2026, 9, 30))).toBe('kindway-journal-2026-10-30.md');
  });
});
