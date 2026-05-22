import { describe, expect, it } from 'vitest';
import { cronToCalendarIntervals } from './cronToCalendar.js';

describe('cronToCalendarIntervals', () => {
  it('U-SCH-01: every minute → 1 entry (Minute omitted), no overflow', () => {
    const out = cronToCalendarIntervals('* * * * *');
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({});
  });

  it('U-SCH-02: monthly on day 31 → 12 entries (one per month)', () => {
    const out = cronToCalendarIntervals('0 0 31 * *', 'UTC');
    expect(out).toHaveLength(12);
    for (const e of out) {
      expect(e.Day).toBe(31);
      expect(e.Minute).toBe(0);
      expect(e.Hour).toBe(0);
      expect(typeof e.Month).toBe('number');
    }
  });

  it('U-SCH-03: leap-year insensitive (Feb 29 still 1 entry)', () => {
    const out = cronToCalendarIntervals('0 9 29 2 *', 'Asia/Shanghai');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ Minute: 0, Hour: 9, Day: 29, Month: 2 });
  });

  it('U-SCH-04: */15 equals 0,15,30,45 explicit form (96 entries)', () => {
    const a = cronToCalendarIntervals('*/15 * * * *');
    const b = cronToCalendarIntervals('0,15,30,45 * * * *');
    expect(a).toEqual(b);
    expect(a).toHaveLength(96);
    const minutes = new Set(a.map((e) => e.Minute));
    expect([...minutes].sort((x, y) => (x ?? 0) - (y ?? 0))).toEqual([0, 15, 30, 45]);
  });

  it('U-SCH-05: dense cron (* * * 1-12 1-7) throws CRON_TOO_DENSE', () => {
    expect(() => cronToCalendarIntervals('* * * 1-12 1-7')).toThrow(
      /CCT_SCHEDULER_CRON_TOO_DENSE/,
    );
  });

  it('hour wildcard preserved: 5 * * * * → 24 entries with Minute=5', () => {
    const out = cronToCalendarIntervals('5 * * * *');
    expect(out).toHaveLength(24);
    for (const e of out) {
      expect(e.Minute).toBe(5);
      expect(typeof e.Hour).toBe('number');
    }
  });

  it('weekday-restricted: 0 9 * * 1-5 → 5 entries with Weekday', () => {
    const out = cronToCalendarIntervals('0 9 * * 1-5');
    expect(out).toHaveLength(5);
    for (const e of out) {
      expect(e.Minute).toBe(0);
      expect(e.Hour).toBe(9);
      expect(e.Weekday).toBeGreaterThanOrEqual(1);
      expect(e.Weekday).toBeLessThanOrEqual(5);
    }
  });

  it('OR semantics when both DOM and DOW restricted: 0 9 1,15 * 1-5', () => {
    const out = cronToCalendarIntervals('0 9 1,15 * 1-5');
    expect(out).toHaveLength(7);
    const days = out.filter((e) => e.Day !== undefined).map((e) => e.Day);
    const weekdays = out.filter((e) => e.Weekday !== undefined).map((e) => e.Weekday);
    expect(days.sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([1, 15]);
    expect(weekdays.sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([1, 2, 3, 4, 5]);
  });
});
