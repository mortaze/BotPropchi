import { Markup } from 'telegraf';
import { buildSafeTelegramButton } from '../../utils/unicode';
import {
  WEEKDAYS_SHORT_SAT_FIRST,
  getMonthGridCells,
  formatShort,
  formatWithWeekday,
  type DateKey,
} from '../../utils/news-date';

// ─── Helper ──────────────────────────────────────────────
function safe(text: string): string {
  return buildSafeTelegramButton(text, 128);
}

function cb(text: string, data: string) {
  return Markup.button.callback(safe(text), data);
}

function noop(text: string) {
  return Markup.button.callback(safe(text), 'noop');
}

// ─── Calendar header row (ش ی د س چ پ ج) ────────────────
function calendarHeader() {
  return [WEEKDAYS_SHORT_SAT_FIRST.map(d => noop(d))];
}

// ─── Calendar grid (section 6.1) ────────────────────────
type CellWithContent = { day: number; dateKey: DateKey; hasContent: boolean };

function calendarGridCells(
  cells: (CellWithContent | null)[],
  todayKey: DateKey,
) {
  const rows: ReturnType<typeof cb>[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const week = cells.slice(i, i + 7);
    rows.push(
      week.map(cell => {
        if (!cell) return noop(' ');
        const isToday = cell.dateKey === todayKey;
        const prefix = cell.hasContent ? '🟢' : '⚪️';
        const label = isToday ? `[${cell.day}]` : `${cell.day}`;
        return cb(`${prefix}${label}`, `news:day:${cell.dateKey}`);
      }),
    );
  }
  return rows;
}

/**
 * Full admin calendar keyboard (section 6.1).
 * @param contentDates — Set of dateKeys that have content (from newsService.getDatesWithContentInMonth)
 */
export function newsCalendarKeyboard(
  year: number,
  month: number,
  todayKey: DateKey,
  contentDates: Set<DateKey>,
) {
  const rawCells = getMonthGridCells(year, month);
  const cells = rawCells.map(c =>
    c ? { ...c, hasContent: contentDates.has(c.dateKey) } : null,
  );

  const grid = calendarGridCells(cells, todayKey);

  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const rows = [
    ...calendarHeader(),
    ...grid,
    [
      cb('◀️ ماه قبل', `news:cal:${ymPrev(year, month)}`),
      noop('📍 ماه جاری'),
      cb('ماه بعد ▶️', `news:cal:${ymNext(year, month)}`),
    ],
    [cb('🔙 پنل ادمین', 'news:back:admin')],
  ];

  return Markup.inlineKeyboard(rows);
}

// ─── Day page — has content (section 6.2) ───────────────
export function newsDayContentKeyboard(dateKey: DateKey) {
  const ym = dateKey.slice(0, 7);
  return Markup.inlineKeyboard([
    [noop(`📅 ${formatWithWeekday(dateKey)}`)],
    [cb('✏️ ویرایش متن', `news:edit:${dateKey}`), cb('🗑 حذف متن', `news:clear:${dateKey}`)],
    [cb('◀️ بازگشت به تقویم', `news:cal:${ym}`)],
    [cb('🔙 پنل ادمین', 'news:back:admin')],
  ]);
}

// ─── Day page — empty (section 6.2) ─────────────────────
export function newsDayEmptyKeyboard(dateKey: DateKey) {
  const ym = dateKey.slice(0, 7);
  return Markup.inlineKeyboard([
    [noop(`📅 ${formatWithWeekday(dateKey)} — بدون محتوا`)],
    [cb('➕ افزودن متن', `news:edit:${dateKey}`)],
    [cb('◀️ بازگشت به تقویم', `news:cal:${ym}`)],
    [cb('🔙 پنل ادمین', 'news:back:admin')],
  ]);
}

// ─── Delete confirmation (section 6.4) ──────────────────
export function newsDeleteConfirmKeyboard(dateKey: DateKey) {
  return Markup.inlineKeyboard([
    [cb('✅ تایید حذف', `news:clear:confirm:${dateKey}`)],
    [cb('❌ انصراف', `news:clear:cancel:${dateKey}`)],
  ]);
}

// ─── Reply keyboard for text input (section 6.3) ────────
export function newsCancelKeyboard() {
  return Markup.keyboard([['❌ لغو']]).resize();
}

// ─── Reply keyboard for calendar (Issue 2) ──────────────
export function newsCalendarReplyKeyboard() {
  return Markup.keyboard([
    ['◀️ ماه قبل', '📍 ماه جاری', 'ماه بعد ▶️'],
    ['🔙 پنل ادمین'],
  ]).resize().persistent();
}

// ─── Reply keyboard for day editor (Issue 3) ────────────
export function newsDayEditorReplyKeyboard() {
  return Markup.keyboard([
    ['➕ افزودن پیام', '🗑 حذف پیام'],
    ['◀️ بازگشت به تقویم', '🔙 پنل ادمین'],
  ]).resize().persistent();
}

// ─── User: yesterday/today/tomorrow (section 7.1) ───────
export function newsUserKeyboard(
  yesterday: DateKey,
  today: DateKey,
  tomorrow: DateKey,
  activeDateKey: DateKey,
) {
  const mark = (dk: DateKey) => (dk === activeDateKey ? '✅' : '📅');
  return Markup.inlineKeyboard([
    [cb(`${mark(yesterday)} دیروز — ${formatShort(yesterday)}`, `news:user:${yesterday}`)],
    [cb(`${mark(today)} امروز — ${formatShort(today)}`, `news:user:${today}`)],
    [cb(`${mark(tomorrow)} فردا — ${formatShort(tomorrow)}`, `news:user:${tomorrow}`)],
  ]);
}

// ─── Internal helpers ───────────────────────────────────
function ymNext(year: number, month: number): string {
  const dt = new Date(Date.UTC(year, month, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}

function ymPrev(year: number, month: number): string {
  const dt = new Date(Date.UTC(year, month - 2, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}
