import { describe, it, expect, vi, afterEach } from 'vitest';
import { computeNextDue } from '../services/scheduled-message.service';

describe('computeNextDue', () => {
  afterEach(() => { vi.useRealTimers(); });

  function utcDate(y: number, mo: number, d: number, h: number, m: number): Date {
    return new Date(Date.UTC(y, mo, d, h, m, 0, 0));
  }

  it('no lastSentAt, start in future → returns start today', () => {
    vi.setSystemTime(utcDate(2026, 6, 2, 10, 0));
    const result = computeNextDue(120, '15:20', null);
    expect(result.toISOString()).toBe('2026-07-02T15:20:00.000Z');
  });

  it('no lastSentAt, start passed, 2min interval → next slot', () => {
    vi.setSystemTime(utcDate(2026, 6, 2, 15, 27));
    const result = computeNextDue(2, '15:20', null);
    expect(result.toISOString()).toBe('2026-07-02T15:28:00.000Z');
  });

  it('no lastSentAt, start passed, 3h interval → next slot', () => {
    vi.setSystemTime(utcDate(2026, 6, 2, 16, 40));
    const result = computeNextDue(180, '09:00', null);
    expect(result.toISOString()).toBe('2026-07-02T18:00:00.000Z');
  });

  it('no lastSentAt, start exactly now → next interval', () => {
    vi.setSystemTime(utcDate(2026, 6, 2, 9, 0));
    const result = computeNextDue(180, '09:00', null);
    expect(result.toISOString()).toBe('2026-07-02T12:00:00.000Z');
  });

  it('has lastSentAt → lastSentAt + interval', () => {
    vi.setSystemTime(utcDate(2026, 6, 2, 15, 30));
    const lastSent = utcDate(2026, 6, 2, 15, 20);
    const result = computeNextDue(10, '09:00', lastSent);
    expect(result.toISOString()).toBe('2026-07-02T15:30:00.000Z');
  });

  it('has lastSentAt, interval 3h → lastSentAt + 3h', () => {
    vi.setSystemTime(utcDate(2026, 6, 2, 16, 0));
    const lastSent = utcDate(2026, 6, 2, 12, 0);
    const result = computeNextDue(180, '09:00', lastSent);
    expect(result.toISOString()).toBe('2026-07-02T15:00:00.000Z');
  });

  it('24h interval, no lastSentAt → tomorrow', () => {
    vi.setSystemTime(utcDate(2026, 6, 2, 10, 0));
    const result = computeNextDue(1440, '09:00', null);
    expect(result.toISOString()).toBe('2026-07-03T09:00:00.000Z');
  });

  it('1 week interval, no lastSentAt → next week', () => {
    vi.setSystemTime(utcDate(2026, 6, 6, 10, 0));
    const result = computeNextDue(10080, '09:00', null);
    expect(result.toISOString()).toBe('2026-07-13T09:00:00.000Z');
  });
});
