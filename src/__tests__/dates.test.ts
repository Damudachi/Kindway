import { onDay } from '@/data/dates';

describe('onDay', () => {
  it('keeps the time of day and moves it onto another day', () => {
    const at = new Date(2026, 9, 30, 23, 0);
    const moved = new Date(onDay('2026-10-30T21:15:00', new Date(2026, 9, 28), at));
    expect([moved.getFullYear(), moved.getMonth(), moved.getDate()]).toEqual([2026, 9, 28]);
    expect([moved.getHours(), moved.getMinutes()]).toEqual([21, 15]);
  });

  it('never lands in the future: a later time today becomes now', () => {
    const at = new Date(2026, 9, 30, 9, 0);
    expect(onDay('2026-10-29T21:00:00', new Date(2026, 9, 30), at)).toBe(at.toISOString());
  });

  it('keeps the time when it is already earlier than now', () => {
    const at = new Date(2026, 9, 30, 22, 0);
    const moved = new Date(onDay('2026-10-29T21:00:00', new Date(2026, 9, 30), at));
    expect([moved.getDate(), moved.getHours()]).toEqual([30, 21]);
  });
});
