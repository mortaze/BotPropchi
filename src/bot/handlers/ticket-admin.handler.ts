import { Telegraf, Markup } from 'telegraf';
import { redisClient } from '../../utils/redis';
import { logger } from '../../utils/logger';
import { ticketService } from '../../services/ticket.service';
import { ticketCategoryService } from '../../services/ticket-category.service';
import { botAdminService } from '../../services/bot-admin.service';
import { ticketActionKeyboard, adminTicketListKeyboard, adminTicketFilterKeyboard, adminTicketByCategoryKeyboard } from '../keyboards/ticket.keyboards';
import { notifyUserNewReply } from '../ticket-notification.service';
import { prisma } from '../../prisma/client';
import { settingsService } from '../../services/settings.service';

function detectMessageType(ctx: any): string {
  if (ctx.message?.photo) return 'PHOTO';
  if (ctx.message?.video) return 'VIDEO';
  if (ctx.message?.voice) return 'VOICE';
  if (ctx.message?.audio) return 'AUDIO';
  if (ctx.message?.document) return 'DOCUMENT';
  if (ctx.message?.sticker) return 'STICKER';
  return 'TEXT';
}

function extractFileData(ctx: any) {
  const msg = ctx.message;
  if (msg?.photo) {
    const largest = msg.photo[msg.photo.length - 1];
    return { fileId: largest.file_id, fileUniqueId: largest.file_unique_id, mimeType: 'photo', fileSize: largest.file_size };
  }
  if (msg?.video) return { fileId: msg.video.file_id, fileUniqueId: msg.video.file_unique_id, mimeType: msg.video.mime_type, fileSize: msg.video.file_size };
  if (msg?.voice) return { fileId: msg.voice.file_id, fileUniqueId: msg.voice.file_unique_id, mimeType: msg.voice.mime_type, fileSize: msg.voice.file_size };
  if (msg?.audio) return { fileId: msg.audio.file_id, fileUniqueId: msg.audio.file_unique_id, mimeType: msg.audio.mime_type, fileSize: msg.audio.file_size };
  if (msg?.document) return { fileId: msg.document.file_id, fileUniqueId: msg.document.file_unique_id, mimeType: msg.document.mime_type, fileSize: msg.document.file_size };
  if (msg?.sticker) return { fileId: msg.sticker.file_id, fileUniqueId: msg.sticker.file_unique_id, mimeType: 'sticker', fileSize: msg.sticker.file_size };
  return {};
}

async function sendTicketMessageLocal(
  telegram: any,
  chatId: number,
  msg: { messageType: string; text?: string | null; fileId?: string | null; caption?: string | null },
): Promise<void> {
  const caption = msg.text || msg.caption || undefined;
  switch (msg.messageType) {
    case 'TEXT':
      if (msg.text) await telegram.sendMessage(chatId, msg.text);
      break;
    case 'PHOTO':
      if (msg.fileId) await telegram.sendPhoto(chatId, msg.fileId, caption ? { caption } : {});
      break;
    case 'VIDEO':
      if (msg.fileId) await telegram.sendVideo(chatId, msg.fileId, caption ? { caption } : {});
      break;
    case 'VOICE':
      if (msg.fileId) await telegram.sendVoice(chatId, msg.fileId);
      break;
    case 'AUDIO':
      if (msg.fileId) await telegram.sendAudio(chatId, msg.fileId, caption ? { caption } : {});
      break;
    case 'DOCUMENT':
      if (msg.fileId) await telegram.sendDocument(chatId, msg.fileId, caption ? { caption } : {});
      break;
    case 'STICKER':
      if (msg.fileId) await telegram.sendSticker(chatId, msg.fileId);
      break;
    default:
      if (msg.text) await telegram.sendMessage(chatId, msg.text);
  }
}

async function sendTicketHistory(ctx: any, ticket: any): Promise<void> {
  const msgs = ticket.messages || [];
  const recent = msgs.slice(-10);

  const header = [
    `🎫 تیکت #${ticket.id}`,
    `📂 موضوع: ${ticket.category?.title || '—'}`,
    `👤 کاربر: ${ticket.user?.firstName || ''} ${ticket.user?.lastName || ''}`.trim(),
    `📊 وضعیت: ${ticket.status}`,
    `📅 ایجاد: ${new Date(ticket.createdAt).toLocaleString('fa-IR')}`,
    `💬 تعداد پیام: ${msgs.length}`,
  ].join('\n');

  await ctx.reply(header);

  if (recent.length === 0) {
    await ctx.reply('📭 هنوز پیامی ارسال نشده.');
    return;
  }

  for (const m of recent) {
    const senderLabel = m.senderType === 'ADMIN' ? '🛡 پشتیبانی:' : '👤 کاربر:';
    const time = new Date(m.createdAt).toLocaleString('fa-IR');
    try {
      if (m.messageType === 'TEXT' || !m.fileId) {
        await ctx.reply(`${senderLabel} [${time}]\n${m.text || '—'}`);
      } else {
        await ctx.reply(`${senderLabel} [${time}]`);
        await sendTicketMessageLocal(ctx.telegram, ctx.from!.id, m);
      }
    } catch (err) {
      await ctx.reply(`${senderLabel}\n[${m.messageType}]`);
    }
  }
}

async function requireAdmin(ctx: any): Promise<boolean> {
  const admin = await botAdminService.getActive(ctx.from?.id);
  if (!admin) {
    await ctx.answerCbQuery('⛔ دسترسی ندارید');
    return false;
  }
  return true;
}

function buildTicketAdminMenuKeyboard() {
  return Markup.keyboard([
    ['📋 همه تیکت\u200cها', '🟢 تیکت\u200cهای باز'],
    ['🔴 تیکت\u200cهای بسته', '📂 دسته\u200cبندی\u200cها'],
    ['🗂 فیلتر دسته\u200cبندی', '↩️ بازگشت به پنل ادمین'],
  ]).resize().persistent();
}

type CatEditorMode = 'view' | 'edit' | 'delete' | 'disable' | 'move';

function buildCategoryEditorMessage(
  categories: { id: number; title: string; enabled: boolean; order: number }[],
  mode: CatEditorMode,
  selectedId?: number,
): { text: string; reply_markup: any } {
  const sorted = [...categories].sort((a, b) => a.order - b.order);

  const catRows = sorted.map(cat => {
    const statusEmoji = cat.enabled ? '✅' : '🚫';
    const modeIcon =
      mode === 'edit' ? '✏️' :
      mode === 'delete' ? '✖' :
      mode === 'disable' ? '🚫' :
      mode === 'move' && selectedId === cat.id ? '✅' :
      mode === 'move' ? '🔀' :
      statusEmoji;
    const label = `${modeIcon} ${cat.title}`;
    return [{ text: label, callback_data: `tcat:click:${cat.id}:${mode}` }];
  });

  const toolbar = [
    { text: '➕ افزودن', callback_data: 'tcat:add' },
    { text: '✏️ ویرایش', callback_data: 'tcat:mode:edit' },
    { text: '✖ حذف', callback_data: 'tcat:mode:delete' },
  ];
  const toolbar2 = [
    { text: '🚫 غیرفعال', callback_data: 'tcat:mode:disable' },
    { text: '🔀 جابجایی', callback_data: 'tcat:mode:move' },
  ];

  const moveRow = mode === 'move' && selectedId
    ? [
        { text: '⬆️ بالا', callback_data: `tcat:move:up:${selectedId}` },
        { text: '⬇️ پایین', callback_data: `tcat:move:down:${selectedId}` },
        { text: '❌ لغو', callback_data: 'tcat:mode:view' },
      ]
    : null;

  const rows = [
    ...catRows,
    toolbar,
    toolbar2,
    ...(moveRow ? [moveRow] : []),
  ];

  const enabledCount = sorted.filter(c => c.enabled).length;
  const text = [
    `📂 دسته‌بندی‌های تیکت`,
    ``,
    `✅ فعال: ${enabledCount} | 📊 مجموع: ${sorted.length}`,
    ``,
    mode === 'edit' ? `✏️ حالت ویرایش: روی دسته‌بندی بزنید تا ویرایش کنید` :
    mode === 'delete' ? `✖ حالت حذف: روی دسته‌بندی بزنید تا حذف شود` :
    mode === 'disable' ? `🚫 حالت غیرفعال: روی دسته‌بندی بزنید تا وضعیت تغییر کند` :
    mode === 'move' ? `🔀 حالت جابجایی: دسته‌بندی را انتخاب کنید سپس جهت بزنید` :
    `برای مدیریت، یکی از گزینه‌های پایین را انتخاب کنید`,
  ].join('\n');

  return { text, reply_markup: { inline_keyboard: rows } };
}

async function refreshCategoryEditor(ctx: any, adminId: number): Promise<void> {
  const msgId = await redisClient.get<number>(`tcat:editor:${adminId}:msgId`);
  const mode = (await redisClient.get<string>(`tcat:editor:${adminId}:mode`) || 'view') as CatEditorMode;
  const selectedId = await redisClient.get<number>(`tcat:editor:${adminId}:selectedId`) || undefined;
  if (!msgId) return;
  const cats = await ticketCategoryService.listAll();
  const { text, reply_markup } = buildCategoryEditorMessage(cats, mode, selectedId);
  try {
    await ctx.telegram.editMessageText(ctx.chat.id, msgId, undefined, text, { reply_markup });
  } catch (err: any) {
    if (!err.message?.includes('not modified')) {
      logger.warn(`[CatEditor] editMessageText failed: ${err.message}`);
    }
  }
}

export function registerTicketAdminHandlers(bot: Telegraf) {
  bot.hears('\uD83C\uDFAB تیکت\u200cها', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from?.id);
    if (!admin) return;
    const { clearAllPostStates } = require('./post-handlers');
    clearAllPostStates(ctx.from.id);
    await ctx.reply('مدیریت تیکت\u200cها:', buildTicketAdminMenuKeyboard());
  });

  bot.hears('📋 همه تیکت\u200cها', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from?.id);
    if (!admin) return;
    const result = await ticketService.getAllTickets({ page: 1, limit: 10 });
    const totalPages = Math.ceil(result.total / 10);
    await ctx.reply('همه تیکت\u200cها:', adminTicketListKeyboard(result.items, 1, totalPages));
  });

  bot.hears('🟢 تیکت\u200cهای باز', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from?.id);
    if (!admin) return;
    const result = await ticketService.getAllTickets({ status: 'OPEN', page: 1, limit: 10 });
    const totalPages = Math.ceil(result.total / 10);
    await ctx.reply('تیکت\u200cهای باز:', adminTicketListKeyboard(result.items, 1, totalPages));
  });

  bot.hears('🔴 تیکت\u200cهای بسته', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from?.id);
    if (!admin) return;
    const result = await ticketService.getAllTickets({ status: 'CLOSED', page: 1, limit: 10 });
    const totalPages = Math.ceil(result.total / 10);
    await ctx.reply('تیکت\u200cهای بسته:', adminTicketListKeyboard(result.items, 1, totalPages));
  });

  bot.hears('📂 دسته\u200cبندی\u200cها', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from?.id);
    if (!admin) return;
    const cats = await ticketCategoryService.listAll();
    const { text, reply_markup } = buildCategoryEditorMessage(cats, 'view');
    const sent = await ctx.reply(text, { reply_markup });
    await redisClient.set(`tcat:editor:${ctx.from.id}:msgId`, sent.message_id, 600);
    await redisClient.set(`tcat:editor:${ctx.from.id}:mode`, 'view', 600);
  });

  bot.hears('🗂 فیلتر دسته\u200cبندی', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from?.id);
    if (!admin) return;

    const categories = await ticketCategoryService.list();
    if (categories.length === 0) {
      return ctx.reply('❌ هیچ دسته\u200cبندی فعالی وجود ندارد.');
    }

    await ctx.reply('یک دسته\u200cبندی انتخاب کنید:', adminTicketByCategoryKeyboard(categories));
  });

  bot.hears('↩️ بازگشت به پنل ادمین', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from?.id);
    if (!admin) return;
    const { buildBotAdminPanelKeyboard } = require('../keyboards');
    const canBroadcast = admin.role === 'OWNER' || admin.role === 'ADMIN';
    const features = await settingsService.getFeatureMap();
    await ctx.reply('پنل ادمین:', buildBotAdminPanelKeyboard(canBroadcast, features));
  });

  bot.action(/^tcat:mode:(view|edit|delete|disable|move)$/, async (ctx: any) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const newMode = ctx.match[1] as CatEditorMode;
    await redisClient.set(`tcat:editor:${ctx.from.id}:mode`, newMode, 600);
    if (newMode !== 'move') {
      await redisClient.del(`tcat:editor:${ctx.from.id}:selectedId`);
    }
    await refreshCategoryEditor(ctx, ctx.from.id);
  });

  bot.action(/^tcat:click:(\d+):(view|edit|delete|disable|move)$/, async (ctx: any) => {
    if (!(await requireAdmin(ctx))) return;
    const catId = parseInt(ctx.match[1]);
    const mode = ctx.match[2] as CatEditorMode;
    if (mode === 'delete') {
      await ctx.answerCbQuery();
      await ticketCategoryService.remove(catId);
      await redisClient.set(`tcat:editor:${ctx.from.id}:mode`, 'view', 600);
      await refreshCategoryEditor(ctx, ctx.from.id);
    } else if (mode === 'disable') {
      const cat = await ticketCategoryService.findById(catId);
      if (!cat) return ctx.answerCbQuery('❌ یافت نشد');
      await ticketCategoryService.update(catId, { enabled: !cat.enabled });
      await ctx.answerCbQuery(cat.enabled ? '🚫 غیرفعال شد' : '✅ فعال شد');
      await refreshCategoryEditor(ctx, ctx.from.id);
    } else if (mode === 'edit') {
      await ctx.answerCbQuery('✏️ نام جدید را بنویسید');
      await redisClient.set(`tcat:editwait:${ctx.from.id}`, catId, 600);
      await ctx.reply('✏️ نام جدید دسته\u200cبندی را بنویسید:');
    } else if (mode === 'move') {
      await ctx.answerCbQuery();
      await redisClient.set(`tcat:editor:${ctx.from.id}:selectedId`, catId, 600);
      await refreshCategoryEditor(ctx, ctx.from.id);
    } else {
      await ctx.answerCbQuery();
    }
  });

  bot.action('tcat:add', async (ctx: any) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    await redisClient.set(`tcat:addwait:${ctx.from.id}`, true, 600);
    await ctx.reply('➕ نام دسته\u200cبندی جدید را بنویسید:');
  });

  bot.action(/^tcat:move:(up|down):(\d+)$/, async (ctx: any) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();
    const direction = ctx.match[1] as 'up' | 'down';
    const catId = parseInt(ctx.match[2]);
    const cats = await ticketCategoryService.listAll();
    const sorted = [...cats].sort((a: any, b: any) => a.order - b.order);
    const idx = sorted.findIndex((c: any) => c.id === catId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const newOrders = sorted.map((c: any, i: number) => {
      if (i === idx) return { id: c.id, order: sorted[swapIdx].order };
      if (i === swapIdx) return { id: c.id, order: sorted[idx].order };
      return { id: c.id, order: c.order };
    });
    for (const item of newOrders) {
      await ticketCategoryService.update(item.id, { order: item.order });
    }
    await refreshCategoryEditor(ctx, ctx.from.id);
  });

  bot.action(/^ticket:admin:cat:(\d+)$/, async (ctx: any) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();

    const categoryId = parseInt(ctx.match[1]);
    try {
      const result = await ticketService.getAllTickets({ categoryId, page: 1, limit: 10 });
      const totalPages = Math.ceil(result.total / 10);

      if (result.total === 0) {
        return ctx.reply('📭 هیچ تیکتی در این دسته\u200cبندی وجود ندارد.');
      }

      await ctx.reply(
        `📂 تیکت\u200cهای این دسته\u200cبندی (${result.total} مورد):`,
        adminTicketListKeyboard(result.items, 1, totalPages)
      );
    } catch (err) {
      logger.error('[TicketAdmin] cat filter error', err);
      await ctx.reply('❌ خطا در دریافت تیکت\u200cها.');
    }
  });

  // ─── ticket:admin:view:{id} ────────────────────────
  bot.action(/^ticket:admin:view:(\d+)$/, async (ctx: any) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();

    const ticketId = parseInt(ctx.match[1]);
    try {
      const ticket = await ticketService.getTicketWithHistory(ticketId);
      if (!ticket) {
        return ctx.reply('❌ تیکت یافت نشد.');
      }

      await sendTicketHistory(ctx, ticket);
      await ctx.reply('عملیات:', ticketActionKeyboard(ticketId));
    } catch (err) {
      logger.error(`[TicketAdmin] view error ticketId=${ticketId}`, err);
      await ctx.reply('❌ خطا در بارگذاری تیکت.');
    }
  });

  // ─── Admin reply message handler (Reply-based) ─────
  bot.on('message', async (ctx: any, next) => {
    const admin = await botAdminService.getActive(ctx.from?.id);
    if (!admin) return next();

    const addCatWait = await redisClient.get<boolean>(`tcat:addwait:${ctx.from.id}`);
    const editCatWait = await redisClient.get<number>(`tcat:editwait:${ctx.from.id}`);
    if (addCatWait && ctx.message?.text) {
      await redisClient.del(`tcat:addwait:${ctx.from.id}`);
      await ticketCategoryService.create(ctx.message.text.trim());
      await ctx.reply(`✅ دسته\u200cبندی «${ctx.message.text.trim()}» اضافه شد.`);
      await refreshCategoryEditor(ctx, ctx.from.id);
      return;
    }
    if (editCatWait && ctx.message?.text) {
      await redisClient.del(`tcat:editwait:${ctx.from.id}`);
      await ticketCategoryService.update(editCatWait, { title: ctx.message.text.trim() });
      await ctx.reply(`✅ نام به «${ctx.message.text.trim()}» تغییر کرد.`);
      await refreshCategoryEditor(ctx, ctx.from.id);
      return;
    }

    const replyToMsgId = ctx.message?.reply_to_message?.message_id;
    if (!replyToMsgId) return next();

    const mapKey = `ticket:msgmap:${ctx.from.id}:${replyToMsgId}`;
    const mapped = await redisClient.get<{ ticketId: number }>(mapKey);
    if (!mapped?.ticketId) return next();

    const ticketId = mapped.ticketId;
    try {
      const messageType = detectMessageType(ctx);
      const fileData = extractFileData(ctx);
      const text = ctx.message?.text || ctx.message?.caption || null;

      await ticketService.addAdminMessage(ticketId, { messageType, text, ...fileData });

      const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: { user: true } });
      if (ticket?.user) {
        notifyUserNewReply({
          telegramId: ticket.user.telegramId,
          ticketId,
          message: { messageType, text, fileId: (fileData as any).fileId ?? null },
        }).catch(err => logger.error(`[TicketAdmin] notifyUser failed ticketId=${ticketId}`, err));
      }

      await ctx.reply(`✅ پاسخ شما به تیکت #${ticketId} ارسال شد.`);
    } catch (err: any) {
      logger.error(`[TicketAdmin] reply error`, err);
      if (err.message === 'TICKET_NOT_FOUND_OR_CLOSED') {
        await ctx.reply(`❌ تیکت #${ticketId} یافت نشد یا بسته شده است.`);
      } else {
        await ctx.reply('\u274C \u062E\u0637\u0627 \u062F\u0631 \u0627\u0631\u0633\u0627\u0644 \u067E\u0627\u0633\u062E.');
      }
    }
  });

  // ─── ticket:close:{ticketId} ───────────────────────
  bot.action(/^ticket:close:(\d+)$/, async (ctx: any) => {
    if (!(await requireAdmin(ctx))) return;

    const ticketId = parseInt(ctx.match[1]);
    try {
      await ticketService.closeTicket(ticketId, true);
      await ctx.answerCbQuery('🔒 تیکت بسته شد');
      try {
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      } catch (_) {}
    } catch (err) {
      logger.error(`[TicketAdmin] close error ticketId=${ticketId}`, err);
      await ctx.answerCbQuery('❌ خطا');
    }
  });

  // ─── ticket:delete:{ticketId} ──────────────────────
  bot.action(/^ticket:delete:(\d+)$/, async (ctx: any) => {
    if (!(await requireAdmin(ctx))) return;

    const ticketId = parseInt(ctx.match[1]);
    try {
      await ticketService.softDeleteTicket(ticketId);
      await ctx.answerCbQuery('🗑 تیکت حذف شد');
      await ctx.editMessageText('این تیکت حذف شد');
    } catch (err) {
      logger.error(`[TicketAdmin] delete error ticketId=${ticketId}`, err);
      await ctx.answerCbQuery('❌ خطا');
    }
  });

  // ─── ticket:profile:{ticketId} ─────────────────────
  bot.action(/^ticket:profile:(\d+)$/, async (ctx: any) => {
    if (!(await requireAdmin(ctx))) return;

    const ticketId = parseInt(ctx.match[1]);
    try {
      const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: { user: true } });
      if (!ticket || !ticket.user) {
        return ctx.answerCbQuery('❌ کاربر یافت نشد', { show_alert: true });
      }

      const u = ticket.user;
      const info = [
        `👤 نام: ${u.firstName || ''} ${u.lastName || ''}`.trim(),
        `🆔 آیدی: ${u.telegramId}`,
        `📛 یوزرنیم: ${u.username ? `@${u.username}` : 'ندارد'}`,
        `📅 عضویت: ${new Date(u.createdAt).toLocaleString('fa-IR')}`,
      ].join('\n');

      await ctx.answerCbQuery(info, { show_alert: true });
    } catch (err) {
      logger.error(`[TicketAdmin] profile error ticketId=${ticketId}`, err);
      await ctx.answerCbQuery('❌ خطا', { show_alert: true });
    }
  });

  // ─── ticket:admin:filter:{status} ──────────────────
  bot.action(/^ticket:admin:filter:(all|open|closed)$/, async (ctx: any) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();

    const filter = ctx.match[1];
    const statusMap: Record<string, any> = { open: 'OPEN', closed: 'CLOSED' };
    const status = statusMap[filter];

    try {
      const result = await ticketService.getAllTickets({ status, page: 1, limit: 10 });
      const totalPages = Math.ceil(result.total / 10);

      await ctx.reply(
        `تیکت\u200cها (${filter === 'all' ? 'همه' : filter === 'open' ? 'باز' : 'بسته'}):`,
        adminTicketListKeyboard(result.items, 1, totalPages),
      );
    } catch (err) {
      logger.error('[TicketAdmin] filter error', err);
      await ctx.reply('❌ خطا در دریافت تیکت\u200cها.');
    }
  });

  // ─── ticket:admin:page:{page} ──────────────────────
  bot.action(/^ticket:admin:page:(\d+)$/, async (ctx: any) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCbQuery();

    const page = parseInt(ctx.match[1]);
    try {
      const result = await ticketService.getAllTickets({ page, limit: 10 });
      const totalPages = Math.ceil(result.total / 10);

      await ctx.reply(
        `تیکت\u200cها (صفحه ${page}):`,
        adminTicketListKeyboard(result.items, page, totalPages),
      );
    } catch (err) {
      logger.error('[TicketAdmin] page error', err);
      await ctx.reply('❌ خطا در دریافت تیکت\u200cها.');
    }
  });
}
