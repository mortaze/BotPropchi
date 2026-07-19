import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getTodayDateKey,
  getMonthGridCells,
  addMonths,
  isValidDateKey,
  addDays,
  formatShort,
  formatWithWeekday,
  getYesterdayTodayTomorrow,
} from '../utils/news-date';

describe('news-date', () => {
  afterEach(() => { vi.useRealTimers(); });

  describe('getTodayDateKey — midnight boundary', () => {
    it('20:31 UTC = 00:01 Asia/Tehran → next day', () => {
      vi.setSystemTime(new Date('2026-07-18T20:31:00Z'));
      expect(getTodayDateKey()).toBe('2026-07-19');
    });

    it('19:59 UTC = 23:59 Asia/Tehran → same day', () => {
      vi.setSystemTime(new Date('2026-07-18T19:59:00Z'));
      expect(getTodayDateKey()).toBe('2026-07-18');
    });

    it('20:00 UTC = 23:30 Asia/Tehran → same day', () => {
      vi.setSystemTime(new Date('2026-07-18T20:00:00Z'));
      expect(getTodayDateKey()).toBe('2026-07-18');
    });
  });

  describe('getMonthGridCells', () => {
    it('July 2026 → 35 cells (5 weeks), 4 leading nulls, 19 Jul at index 22', () => {
      const cells = getMonthGridCells(2026, 7);
      expect(cells.length).toBe(35);
      // 1 Jul 2026 = Wednesday → leading blanks for Sat-first: (3+1)%7 = 4
      expect(cells[0]).toBeNull();
      expect(cells[1]).toBeNull();
      expect(cells[2]).toBeNull();
      expect(cells[3]).toBeNull();
      // 1 Jul at index 4
      expect(cells[4]).toEqual({ day: 1, dateKey: '2026-07-01' });
      // 19 Jul at index 22
      expect(cells[22]).toEqual({ day: 19, dateKey: '2026-07-19' });
    });

    it('Feb 2028 (leap year) → 29 days', () => {
      const cells = getMonthGridCells(2028, 2);
      const days = cells.filter(c => c !== null);
      expect(days.length).toBe(29);
      expect(days[28]).toEqual({ day: 29, dateKey: '2028-02-29' });
    });

    it('Feb 2027 (non-leap) → 28 days', () => {
      const cells = getMonthGridCells(2027, 2);
      const days = cells.filter(c => c !== null);
      expect(days.length).toBe(28);
    });
  });

  describe('addMonths', () => {
    it('2026-12 + 1 = 2027-01', () => {
      expect(addMonths('2026-12-15', 1)).toBe('2027-01');
    });

    it('2026-01 - 1 = 2025-12', () => {
      expect(addMonths('2026-01-15', -1)).toBe('2025-12');
    });
  });

  describe('isValidDateKey', () => {
    it('2026-02-30 → false', () => {
      expect(isValidDateKey('2026-02-30')).toBe(false);
    });

    it('2026-07-19 → true', () => {
      expect(isValidDateKey('2026-07-19')).toBe(true);
    });

    it('2028-02-29 (leap) → true', () => {
      expect(isValidDateKey('2028-02-29')).toBe(true);
    });

    it('2027-02-29 (non-leap) → false', () => {
      expect(isValidDateKey('2027-02-29')).toBe(false);
    });

    it('invalid format → false', () => {
      expect(isValidDateKey('not-a-date')).toBe(false);
      expect(isValidDateKey('2026-7-19')).toBe(false);
    });
  });

  describe('addDays', () => {
    it('forward', () => {
      expect(addDays('2026-07-19', 1)).toBe('2026-07-20');
    });

    it('backward', () => {
      expect(addDays('2026-07-19', -1)).toBe('2026-07-18');
    });

    it('month boundary', () => {
      expect(addDays('2026-07-31', 1)).toBe('2026-08-01');
    });
  });

  describe('formatShort', () => {
    it('formats correctly', () => {
      expect(formatShort('2026-07-19')).toBe('19 جولای 2026');
    });
  });

  describe('formatWithWeekday', () => {
    it('includes weekday name', () => {
      // 19 Jul 2026 = Sunday
      expect(formatWithWeekday('2026-07-19')).toBe('یکشنبه 19 جولای 2026');
    });
  });

  describe('getYesterdayTodayTomorrow', () => {
    it('returns correct trio', () => {
      vi.setSystemTime(new Date('2026-07-19T12:00:00Z'));
      const result = getYesterdayTodayTomorrow();
      expect(result).toEqual({
        yesterday: '2026-07-18',
        today: '2026-07-19',
        tomorrow: '2026-07-20',
      });
    });
  });
});
