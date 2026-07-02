import { describe, it, expect, vi, afterEach } from 'vitest';
import { calculateFirstOccurrence } from '../services/scheduled-message.service';

describe('calculateFirstOccurrence', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // Helper: create a Date in UTC at a specific time
  function utcDate(year: number, month: number, day: number, hour: number, min: number): Date {
    return new Date(Date.UTC(year, month, day, hour, min, 0, 0));
  }

  it('start time is in the future → returns that exact time', () => {
    // Now = 10:00 UTC, Start = 15:20 → first occurrence = 15:20 today
    const now = utcDate(2026, 6, 2, 10, 0);
    vi.setSystemTime(now);

    const result = calculateFirstOccurrence(120, '15:20');
    expect(result.toISOString()).toBe('2026-07-02T15:20:00.000Z');
  });

  it('start time has passed today, interval 2 min → next slot tomorrow or next interval', () => {
    // Now = 15:27 UTC, Start = 15:20, Interval = 2min
    // 15:20 already passed → 15:22, 15:24, 15:26 also passed → 15:28
    const now = utcDate(2026, 6, 2, 15, 27);
    vi.setSystemTime(now);

    const result = calculateFirstOccurrence(2, '15:20');
    expect(result.toISOString()).toBe('2026-07-02T15:28:00.000Z');
  });

  it('start time has passed today, interval 3h → next slot', () => {
    // Now = 16:40 UTC, Start = 09:00, Interval = 180min (3h)
    // 09:00 → 12:00 → 15:00 → 18:00 (next valid)
    const now = utcDate(2026, 6, 2, 16, 40);
    vi.setSystemTime(now);

    const result = calculateFirstOccurrence(180, '09:00');
    expect(result.toISOString()).toBe('2026-07-02T18:00:00.000Z');
  });

  it('start time exactly now → returns next interval', () => {
    // Now = 09:00 UTC, Start = 09:00 → 09:00 <= now → 09:00 + 3h = 12:00
    const now = utcDate(2026, 6, 2, 9, 0);
    vi.setSystemTime(now);

    const result = calculateFirstOccurrence(180, '09:00');
    expect(result.toISOString()).toBe('2026-07-02T12:00:00.000Z');
  });

  it('interval 24h, start 09:00, now 10:00 → tomorrow 09:00', () => {
    const now = utcDate(2026, 6, 2, 10, 0);
    vi.setSystemTime(now);

    const result = calculateFirstOccurrence(1440, '09:00');
    expect(result.toISOString()).toBe('2026-07-03T09:00:00.000Z');
  });

  it('interval 1 week, start 09:00, now Monday 10:00 → next Monday 09:00', () => {
    // 2026-07-06 is a Monday
    const now = utcDate(2026, 6, 6, 10, 0);
    vi.setSystemTime(now);

    const result = calculateFirstOccurrence(10080, '09:00');
    expect(result.toISOString()).toBe('2026-07-13T09:00:00.000Z');
  });

  it('interval 1 min, start now+30s → returns start time', () => {
    const now = utcDate(2026, 6, 2, 15, 0);
    vi.setSystemTime(now);

    const result = calculateFirstOccurrence(1, '15:01');
    expect(result.toISOString()).toBe('2026-07-02T15:01:00.000Z');
  });
});
