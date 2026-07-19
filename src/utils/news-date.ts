// src/utils/news-date.ts
// منطق خالص — بدون وابستگی به DB یا Telegraf — کاملاً قابل تست واحد

export const NEWS_TIMEZONE = 'Asia/Tehran';

export const GREGORIAN_MONTHS_FA = [
  'ژانویه', 'فوریه', 'مارس', 'آوریل', 'می', 'ژوئن',
  'جولای', 'آگوست', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر',
];

// اندیس = Date.getUTCDay() → 0=یکشنبه ... 6=شنبه
export const WEEKDAYS_FULL_FA = [
  'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه',
];

// چیدمان تقویم از شنبه شروع می‌شود
export const WEEKDAYS_SHORT_SAT_FIRST = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

export type DateKey = string; // فرمت ثابت: 'YYYY-MM-DD'، همیشه ۲ رقمی برای ماه/روز

/** امروز را در منطقهٔ زمانی Asia/Tehran به‌صورت YYYY-MM-DD برمی‌گرداند. هرگز new Date() خام مقایسه نکنید. */
export function getTodayDateKey(referenceDate: Date = new Date()): DateKey {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NEWS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(referenceDate);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const d = parts.find((p) => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}

function pad2(n: number): string { return String(n).padStart(2, '0'); }

export function utcDateToKey(dt: Date): DateKey {
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

export function keyToUtcMidnight(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** اعتبارسنجی دفاعی: رد می‌کند تاریخ‌های ناموجود مثل 2026-02-30 را (نه فقط فرمت رجکس). */
export function isValidDateKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function addDays(key: DateKey, delta: number): DateKey {
  const dt = keyToUtcMidnight(key);
  dt.setUTCDate(dt.getUTCDate() + delta);
  return utcDateToKey(dt);
}

export function addMonths(key: DateKey, delta: number): DateKey {
  const [y, m] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}`; // فرمت YYYY-MM برای پیمایش ماه
}

/** برچسب کوتاه برای متن دکمه: «19 جولای 2026» */
export function formatShort(key: DateKey): string {
  const [y, m, d] = key.split('-').map(Number);
  return `${d} ${GREGORIAN_MONTHS_FA[m - 1]} ${y}`;
}

/** برچسب کامل برای متن پیام: «یکشنبه 19 جولای 2026» */
export function formatWithWeekday(key: DateKey): string {
  const weekday = WEEKDAYS_FULL_FA[keyToUtcMidnight(key).getUTCDay()];
  return `${weekday} ${formatShort(key)}`;
}

export interface MonthGridCell { day: number; dateKey: DateKey; }

/**
 * شبکهٔ روزهای یک ماه را برمی‌گرداند — سلول‌های خالی ابتدا/انتهای ماه برای
 * تراز هفت‌ستونه (شنبه تا جمعه) با null پر می‌شوند. طول آرایه همیشه مضرب ۷ است.
 * صحت‌سنجی‌شده دستی برای جولای ۲۰۲۶: ۱ جولای = چهارشنبه → ۴ سلول خالی ابتدایی
 * (ش، ی، د، س) سپس چ=1، پ=2، ج=3 ...؛ و ۱۹ جولای درست روی ستون «ی» (یکشنبه) می‌افتد.
 */
export function getMonthGridCells(year: number, month: number /* 1-12 */): (MonthGridCell | null)[] {
  const firstWeekdayJs = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0=یکشنبه..6=شنبه
  const leadingBlanks = (firstWeekdayJs + 1) % 7; // تبدیل به آفست چیدمانِ «شنبه اول»
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const cells: (MonthGridCell | null)[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, dateKey: `${year}-${pad2(month)}-${pad2(day)}` });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** { yesterday, today, tomorrow } را به‌صورت DateKey برمی‌گرداند — تنها منبعِ حقیقتِ این سه مقدار در کل ماژول. */
export function getYesterdayTodayTomorrow(referenceDate: Date = new Date()) {
  const today = getTodayDateKey(referenceDate);
  return { yesterday: addDays(today, -1), today, tomorrow: addDays(today, 1) };
}
