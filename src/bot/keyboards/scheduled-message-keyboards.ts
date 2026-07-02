import { Markup } from 'telegraf';

// ─── Main Menu ────────────────────────────────────────────

export function scheduledMessageMainMenuKeyboard() {
  return Markup.keyboard([
    ['➕ ایجاد پست جدید'],
    ['📄 لیست پیام‌ها', '👥 مدیریت گروه‌ها'],
    ['📊 گزارش ارسال', '⚙️ تنظیمات'],
    ['↩️ بازگشت به پنل ادمین'],
  ]).resize().persistent();
}

// ─── Post List ─────────────────────────────────────────────

export function scheduledMessageListKeyboard(messages: any[], page: number, totalPages: number) {
  const rows: any[][] = [];

  for (const msg of messages) {
    const statusIcon = msg.isPublished ? '🟢' : '⚪';
    rows.push([Markup.button.callback(`${statusIcon} ${msg.title}`, `sched:view:${msg.id}`)]);
  }

  const navRow: any[] = [];
  if (page > 1) navRow.push(Markup.button.callback('◀️ قبلی', `sched:list:${page - 1}`));
  navRow.push(Markup.button.callback(`${page} از ${totalPages}`, 'noop'));
  if (page < totalPages) navRow.push(Markup.button.callback('بعدی ▶️', `sched:list:${page + 1}`));
  rows.push(navRow);

  rows.push([Markup.button.callback('↩️ بازگشت', 'sched:menu')]);

  return Markup.inlineKeyboard(rows);
}

// ─── Post Editor (management view) ────────────────────────

export function scheduledMessageEditorKeyboard(id: number, isPublished: boolean) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📝 ویرایش عنوان', `sched:edit:${id}:title`)],
    [Markup.button.callback('📋 مدیریت پیام‌ها', `sched:msgs:${id}`)],
    [Markup.button.callback('🔘 مدیریت دکمه‌ها', `sched:btns:${id}`)],
    [Markup.button.callback('⏰ تنظیم زمان‌بندی', `sched:schedule:${id}`)],
    [
      isPublished
        ? Markup.button.callback('📤 لغو انتشار', `sched:unpublish:${id}`)
        : Markup.button.callback('🚀 انتشار', `sched:publish:${id}`),
    ],
    [Markup.button.callback('🗑 حذف', `sched:delete:${id}`)],
    [Markup.button.callback('↩️ بازگشت به لیست', 'sched:list:1')],
  ]);
}

// ─── Reply Keyboards ──────────────────────────────────────

export function scheduledMessageManagerReplyKeyboard() {
  return Markup.keyboard([
    ['📝 ویرایش محتوا', '🏷 ویرایش عنوان'],
    ['🔘 ویرایش دکمه‌ها'],
    ['🚀 تغییر وضعیت انتشار'],
    ['🗑 حذف پست', '🔙 بازگشت'],
  ]).resize().persistent();
}

export function scheduledMessageEditReplyKeyboard() {
  return Markup.keyboard([
    ['📝 ویرایش محتوا', '🏷 ویرایش عنوان'],
    ['➕ افزودن پیام'],
    ['🔘 ویرایش دکمه‌ها'],
    ['🚀 تغییر وضعیت انتشار'],
    ['🗑 حذف پست', '🔙 بازگشت'],
  ]).resize().persistent();
}

export function scheduledMessageCancelOnlyKeyboard() {
  return Markup.keyboard([['❌ لغو']]).resize().persistent();
}

export function scheduledMessageBackKeyboard() {
  return Markup.keyboard([['🔙 بازگشت']]).resize().persistent();
}

// ─── Schedule Interval Selection ──────────────────────────

export function scheduleIntervalKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⏰ هر ۳ ساعت', 'sched:interval:3')],
    [Markup.button.callback('⏰ هر ۶ ساعت', 'sched:interval:6')],
    [Markup.button.callback('⏰ هر ۹ ساعت', 'sched:interval:9')],
    [Markup.button.callback('⏰ هر ۱۲ ساعت', 'sched:interval:12')],
    [Markup.button.callback('⏰ هر ۲۴ ساعت', 'sched:interval:24')],
    [Markup.button.callback('⏰ هر هفته', 'sched:interval:168')],
    [Markup.button.callback('⏰ زمان سفارشی', 'sched:interval:custom')],
    [Markup.button.callback('↩️ بازگشت', 'sched:menu')],
  ]);
}

// ─── Group Selection ──────────────────────────────────────

export function scheduleGroupKeyboard(groups: any[]) {
  const rows: any[][] = groups.map((g) => [
    Markup.button.callback(`${g.title}`, `sched:group:${g.chatId}`),
  ]);
  rows.push([Markup.button.callback('↩️ بازگشت', 'sched:menu')]);
  return Markup.inlineKeyboard(rows);
}

// ─── Topic Selection ──────────────────────────────────────

export function scheduleTopicKeyboard(topics: any[], hasAllOption = true) {
  const rows: any[][] = [];
  if (hasAllOption) {
    rows.push([Markup.button.callback('📌 همه تاپیک‌ها', 'sched:topic:all')]);
  }
  for (const t of topics) {
    rows.push([Markup.button.callback(`${t.name}`, `sched:topic:${t.id}`)]);
  }
  rows.push([Markup.button.callback('↩️ بازگشت', 'sched:menu')]);
  return Markup.inlineKeyboard(rows);
}

// ─── Message Management ───────────────────────────────────

export function scheduledMessageListInlineKeyboard(messages: any[], scheduledMessageId: number) {
  const rows: any[][] = [];
  for (const msg of messages) {
    const preview = (msg.text || '(رسانه)').slice(0, 30);
    rows.push([
      Markup.button.callback(`${msg.order + 1}. ${preview}`, `sched:msg:edit:${msg.id}`),
      Markup.button.callback('🗑', `sched:msg:del:${msg.id}`),
    ]);
  }
  rows.push([Markup.button.callback('➕ افزودن پیام', `sched:msg:add:${scheduledMessageId}`)]);
  rows.push([Markup.button.callback('↩️ بازگشت', `sched:view:${scheduledMessageId}`)]);
  return Markup.inlineKeyboard(rows);
}

// ─── Delete Confirmation ──────────────────────────────────

export function scheduledMessageDeleteConfirmKeyboard(id: number) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ تایید حذف', `sched:delete:confirm:${id}`)],
    [Markup.button.callback('❌ انصراف', `sched:view:${id}`)],
  ]);
}

// ─── Publish Options ──────────────────────────────────────

export function scheduledMessagePublishKeyboard(id: number) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🚀 انتشار', `sched:publish:${id}`)],
    [Markup.button.callback('↩️ بازگشت', `sched:view:${id}`)],
  ]);
}

// ─── Settings ─────────────────────────────────────────────

export function scheduledMessageSettingsKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⛔ توقف همه ارسال‌ها', 'sched:emergency_stop')],
    [Markup.button.callback('↩️ بازگشت', 'sched:menu')],
  ]);
}

// ─── Confirm Emergency Stop ───────────────────────────────

export function scheduledMessageEmergencyStopConfirmKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ بله، متوقف کن', 'sched:emergency_stop:confirm')],
    [Markup.button.callback('❌ انصراف', 'sched:settings')],
  ]);
}

// ─── Dashboard ────────────────────────────────────────────

export function scheduledMessageDashboardKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔄 تازه‌سازی', 'sched:dashboard:refresh')],
    [Markup.button.callback('↩️ بازگشت', 'sched:menu')],
  ]);
}
