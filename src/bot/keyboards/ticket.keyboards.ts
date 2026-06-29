import { Markup } from 'telegraf';

export function ticketCategoryKeyboard(categories: { id: number; title: string }[]) {
  if (!categories || categories.length === 0) {
    return Markup.inlineKeyboard([[Markup.button.callback('دسته‌بندی تعریف نشده', 'noop')]]);
  }
  return Markup.inlineKeyboard(
    categories.map(c => [Markup.button.callback(c.title, `ticket:cat:${c.id}`)])
  );
}

export function ticketActionKeyboard(ticketId: number) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('💬 پاسخ', `ticket:reply:${ticketId}`),
      Markup.button.callback('🔒 بستن', `ticket:close:${ticketId}`),
    ],
    [
      Markup.button.callback('🗑 حذف', `ticket:delete:${ticketId}`),
      Markup.button.callback('👤 پروفایل', `ticket:profile:${ticketId}`),
    ],
  ]);
}

export function ticketViewKeyboard(ticketId: number) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📨 مشاهده گفتگو', `ticket:view:${ticketId}`)],
  ]);
}

export function ticketReplyKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✍️ پاسخ مجدد', 'ticket:my_reply')],
  ]);
}

export function adminTicketListKeyboard(
  tickets: {
    id: number;
    status: string;
    category?: { title?: string | null } | null;
    user?: { firstName?: string | null; username?: string | null } | null;
  }[],
  page: number,
  totalPages: number
) {
  const rows: any[][] = tickets.map(t => {
    const name = t.user?.firstName || t.user?.username || 'کاربر';
    const subject = t.category?.title || '—';
    const label = `#${t.id} | ${subject} | ${name}`;
    const style = t.status === 'OPEN' ? 'success' : t.status === 'CLOSED' ? 'danger' : undefined;
    const btn: any = {
      text: label,
      callback_data: `ticket:admin:view:${t.id}`,
    };
    if (style) btn.style = style;
    return [btn];
  });

  if (totalPages > 1) {
    const navRow: any[] = [];
    if (page > 1) navRow.push({ text: '◀️ قبلی', callback_data: `ticket:admin:page:${page - 1}` });
    navRow.push({ text: `${page}/${totalPages}`, callback_data: 'noop' });
    if (page < totalPages) navRow.push({ text: '▶️ بعدی', callback_data: `ticket:admin:page:${page + 1}` });
    rows.push(navRow);
  }

  return { reply_markup: { inline_keyboard: rows } };
}

export function adminTicketFilterKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('همه', 'ticket:admin:filter:all'),
      Markup.button.callback('باز', 'ticket:admin:filter:open'),
      Markup.button.callback('بسته', 'ticket:admin:filter:closed'),
    ],
  ]);
}

export function ticketUserMenuKeyboard() {
  return Markup.keyboard([
    ['🎫 ایجاد تیکت جدید'],
    ['📋 تیکت\u200cهای من'],
    ['↩️ بازگشت به منو'],
  ]).resize().persistent();
}

export function adminTicketByCategoryKeyboard(categories: { id: number; title: string }[]) {
  if (!categories || categories.length === 0) {
    return Markup.inlineKeyboard([[Markup.button.callback('دسته\u200cبندی تعریف نشده', 'noop')]]);
  }
  return Markup.inlineKeyboard([
    ...categories.map(c => [Markup.button.callback(`📂 ${c.title}`, `ticket:admin:cat:${c.id}`)]),
  ]);
}
