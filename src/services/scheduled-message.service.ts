import { Telegraf } from 'telegraf';
import { PostStatus, PostMessageType } from '@prisma/client';
import { prisma } from '../prisma/client';
import { scheduledMessageRepository } from '../repositories/scheduled-message.repository';
import { logger } from '../utils/logger';
import { sanitizeTelegramText, sanitizeTelegramExtra, validateDbInput } from '../utils/unicode';
import { buildTelegramKeyboard } from './renderer';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Core Scheduling Logic ────────────────────────────────

/**
 * Compute the first send time from startTime on today's date.
 * If today's slot passed, advance by interval until we land in the future.
 */
function firstOccurrence(intervalMinutes: number, startTime: string): Date {
  const [h, m] = startTime.split(':').map(Number);
  const now = new Date();
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m, 0, 0));
  while (t.getTime() <= now.getTime()) {
    t.setTime(t.getTime() + intervalMinutes * 60_000);
  }
  return t;
}

/**
 * Compute the next due time for a scheduled message.
 * This is the SINGLE source of truth — used by scheduler, display, and test send.
 *
 * Rules:
 *   - lastSentAt is null  → firstOccurrence(startTime)
 *   - lastSentAt exists   → lastSentAt + intervalMinutes
 */
export function computeNextDue(intervalMinutes: number, startTime: string, lastSentAt: Date | null): Date {
  if (!lastSentAt) {
    return firstOccurrence(intervalMinutes, startTime);
  }
  return new Date(lastSentAt.getTime() + intervalMinutes * 60_000);
}

/**
 * Decide whether a message should be sent NOW.
 * Single implementation — used by scheduler AND display.
 */
function isDue(msg: {
  isPublished: boolean;
  status: string;
  intervalMinutes: number | null;
  startTime: string | null;
  targetChatId: any;
  lastSentAt: Date | null;
}, now: Date): { due: boolean; reason: string } {
  if (!msg.isPublished) return { due: false, reason: 'isPublished=false' };
  if (msg.status !== PostStatus.PUBLISHED) return { due: false, reason: `status=${msg.status}` };
  if (msg.intervalMinutes == null || msg.intervalMinutes <= 0) return { due: false, reason: 'INVALID_INTERVAL' };
  if (!msg.startTime) return { due: false, reason: 'MISSING_START_TIME' };
  if (msg.targetChatId == null) return { due: false, reason: 'MISSING_CHAT' };

  const nextDue = computeNextDue(msg.intervalMinutes, msg.startTime, msg.lastSentAt);
  if (nextDue.getTime() > now.getTime()) {
    return { due: false, reason: `WAITING_UNTIL ${nextDue.toISOString()}` };
  }

  return { due: true, reason: 'OK' };
}

// ─── Service ──────────────────────────────────────────────

class ScheduledMessageService {
  private bot?: Telegraf;

  setBot(bot: Telegraf) { this.bot = bot; }

  // ─── CRUD ────────────────────────────────────────────────

  async create(data: { title: string; createdBy?: bigint }) {
    const title = validateDbInput(data.title, 'title');
    return scheduledMessageRepository.create({ title, createdBy: data.createdBy });
  }

  async update(id: number, data: { title?: string }) {
    const updateData: any = {};
    if (data.title !== undefined) updateData.title = validateDbInput(data.title, 'title');
    return scheduledMessageRepository.update(id, updateData);
  }

  async delete(id: number) {
    return scheduledMessageRepository.delete(id);
  }

  async publish(id: number) {
    const msg = await scheduledMessageRepository.findById(id);
    if (!msg) throw new Error('Post not found');
    if (!msg.targetChatId) throw new Error('targetChatId is missing');
    if (!msg.intervalMinutes) throw new Error('intervalMinutes is missing');
    if (!msg.startTime) throw new Error('startTime is missing');
    if ((msg.messages?.length || 0) === 0) throw new Error('No messages to send');

    // Compute first occurrence for display — scheduler will recompute from lastSentAt
    const nextSendAt = firstOccurrence(msg.intervalMinutes, msg.startTime);

    logger.info(
      `[SchedMsg] PUBLISH msg=${id} | interval=${msg.intervalMinutes}min | start=${msg.startTime} | ` +
      `chatId=${msg.targetChatId} | topicId=${msg.targetTopicId ?? 'null'} | nextSendAt=${nextSendAt.toISOString()}`
    );

    await scheduledMessageRepository.update(id, {
      status: PostStatus.PUBLISHED,
      isPublished: true,
      nextSendAt, // display-only cache
    });

    const verify = await scheduledMessageRepository.findById(id);
    logger.info(`[SchedMsg] PERSIST VERIFY: isPublished=${verify?.isPublished} status=${verify?.status} nextSendAt=${verify?.nextSendAt?.toISOString() ?? 'NULL'}`);
  }

  async unpublish(id: number) {
    return scheduledMessageRepository.update(id, {
      status: PostStatus.DRAFT, isPublished: false, nextSendAt: null,
    });
  }

  // ─── Message Management ──────────────────────────────────

  async addMessage(scheduledMessageId: number) {
    const lastMsg = await prisma.scheduledMessageMessage.findFirst({
      where: { scheduledMessageId }, orderBy: { order: 'desc' },
    });
    const order = (lastMsg?.order ?? -1) + 1;
    return prisma.scheduledMessageMessage.create({
      data: { scheduledMessageId, text: '', type: PostMessageType.text, order },
    });
  }

  async updateMessage(messageId: number, data: { text?: string; type?: PostMessageType; mediaFileId?: string; mediaGroupId?: string; entities?: any; captionEntities?: any; caption?: string; replyMarkup?: any; parseMode?: any; forwardSource?: any }) {
    return prisma.scheduledMessageMessage.update({ where: { id: messageId }, data });
  }

  async deleteMessage(messageId: number) {
    const msg = await prisma.scheduledMessageMessage.findUnique({ where: { id: messageId } });
    if (!msg) return;
    await prisma.scheduledMessageMessage.delete({ where: { id: messageId } });
    const remaining = await prisma.scheduledMessageMessage.findMany({
      where: { scheduledMessageId: msg.scheduledMessageId }, orderBy: { order: 'asc' },
    });
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].order !== i) {
        await prisma.scheduledMessageMessage.update({ where: { id: remaining[i].id }, data: { order: i } });
      }
    }
  }

  async reorderMessages(scheduledMessageId: number, messageIds: number[]) {
    for (let i = 0; i < messageIds.length; i++) {
      await prisma.scheduledMessageMessage.update({ where: { id: messageIds[i] }, data: { order: i } });
    }
  }

  async listMessages(scheduledMessageId: number) {
    return prisma.scheduledMessageMessage.findMany({ where: { scheduledMessageId }, orderBy: { order: 'asc' } });
  }

  // ─── Button Management ───────────────────────────────────

  async addButton(scheduledMessageId: number, data: { text: string; type?: string; value?: string; row?: number; col?: number; messageId?: number }) {
    return prisma.scheduledMessageButton.create({
      data: { scheduledMessageId, messageId: data.messageId, text: data.text, type: data.type ?? 'URL', value: data.value, row: data.row ?? 0, col: data.col ?? 0 },
    });
  }

  async updateButton(buttonId: number, data: { text?: string; type?: string; value?: string; row?: number; col?: number }) {
    return prisma.scheduledMessageButton.update({ where: { id: buttonId }, data });
  }

  async deleteButton(buttonId: number) {
    return prisma.scheduledMessageButton.delete({ where: { id: buttonId } });
  }

  async listButtons(scheduledMessageId: number) {
    return prisma.scheduledMessageButton.findMany({ where: { scheduledMessageId }, orderBy: [{ row: 'asc' }, { col: 'asc' }] });
  }

  // ─── Scheduler (new architecture) ────────────────────────

  async processDueScheduled() {
    const now = new Date();
    logger.info(`[SchedMsg] ═══ TICK ${now.toISOString()} ═══`);

    const allPublished = await prisma.scheduledMessage.findMany({
      where: { isPublished: true, status: PostStatus.PUBLISHED },
      select: {
        id: true, title: true, intervalMinutes: true, startTime: true,
        lastSentAt: true, sendCount: true, nextSendAt: true,
        targetChatId: true, targetTopicId: true, isPublished: true, status: true,
      },
    });

    logger.info(`[SchedMsg] Published count: ${allPublished.length}`);

    const dueIds: number[] = [];

    for (const m of allPublished) {
      const { due, reason } = isDue(m, now);
      const nextDue = (m.intervalMinutes && m.startTime)
        ? computeNextDue(m.intervalMinutes, m.startTime, m.lastSentAt)
        : null;

      logger.info(
        `[SchedMsg] #${m.id} "${m.title}" | NOW=${now.toISOString()} | ` +
        `START=${m.startTime} | INTERVAL=${m.intervalMinutes}min | ` +
        `LAST_SENT=${m.lastSentAt?.toISOString() ?? 'never'} | ` +
        `NEXT_DUE=${nextDue?.toISOString() ?? 'NULL'} | ` +
        `NEXT_SEND_DB=${m.nextSendAt?.toISOString() ?? 'NULL'} | ` +
        `CHAT=${m.targetChatId ?? 'NULL'} | TOPIC=${m.targetTopicId ?? 'NULL'} | ` +
        `COUNT=${m.sendCount} | ` +
        `IS_DUE=${due ? 'YES' : 'NO'} | WHY=${reason}`
      );

      if (due) dueIds.push(m.id);
    }

    logger.info(`[SchedMsg] Due count: ${dueIds.length}`);

    // Load full records (with messages + buttons) only for due items
    for (const id of dueIds) {
      const full = await scheduledMessageRepository.findById(id);
      if (full) {
        logger.info(`[SchedMsg] ▶ SEND_START #${id} "${full.title}"`);
        await this.sendToGroup(full);
      }
    }
  }

  async sendToGroup(msg: any) {
    if (!this.bot) {
      logger.warn(`[SchedMsg] SKIP msg=${msg.id}: bot not set`);
      return;
    }

    // Read all bindings from ScheduledMessageBinding table (multi-topic support)
    const bindings = await prisma.scheduledMessageBinding.findMany({
      where: { scheduledMessageId: msg.id, isActive: true },
      orderBy: [{ chatId: 'asc' }, { topicId: 'asc' }],
    });

    // Fallback to old single-target fields if no bindings exist
    if (bindings.length === 0) {
      if (!msg.targetChatId) {
        logger.warn(`[SchedMsg] SKIP msg=${msg.id}: no bindings and no targetChatId`);
        return;
      }
      const chatId = Number(msg.targetChatId);
      const threadId = msg.targetTopicId ? Number(msg.targetTopicId) : undefined;
      await this.sendToSingleTarget(msg, chatId, threadId);
      return;
    }

    logger.info(`[SchedMsg] SEND_START msg=${msg.id} bindings=${bindings.length} msgs=${msg.messages?.length || 0}`);

    for (const binding of bindings) {
      const chatId = Number(binding.chatId);
      const threadId = binding.topicId != null ? Number(binding.topicId) : undefined;
      logger.info(`[SchedMsg] SEND_BINDING msg=${msg.id} chatId=${chatId} threadId=${threadId ?? 'none'}`);
      await this.sendToSingleTarget(msg, chatId, threadId);
    }
  }

  private async sendToSingleTarget(msg: any, chatId: number, threadId?: number) {
    try {
      const messages = msg.messages || [];

      // Load ALL buttons for this scheduled message ONCE (before the loop)
      const allButtons = await scheduledMessageRepository.findButtonsByScheduledMessage(msg.id);

      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        logger.info(`[SchedMsg] SEND msg=${msg.id} [${i + 1}/${messages.length}] type=${message.type} textLen=${(message.text || '').length} entities=${(message.entities as any[])?.length || 0}`);

        // Filter buttons to ONLY this specific child message
        const buttonsForMsg = allButtons.filter((b: any) => b.messageId === message.id);

        const keyboard = buttonsForMsg.length > 0
          ? this.buildInlineKeyboard(buttonsForMsg, message.id)
          : [];
        const inlineKeyboard = keyboard.length > 0
          ? { inline_keyboard: keyboard }
          : undefined;

        // Media group items cannot have reply_markup
        const isMediaGroup = !!message.mediaGroupId;
        const finalInlineKeyboard = isMediaGroup ? undefined : inlineKeyboard;

        // Keyboard logging per message
        if (buttonsForMsg.length > 0) {
          const btnTypes = buttonsForMsg.map(b => (b.type || 'URL').toUpperCase());
          logger.info(`[SchedMsg] KEYBOARD msg=${msg.id} [${i + 1}/${messages.length}] childMsgId=${message.id} buttonCount=${buttonsForMsg.length} types=${btnTypes.join(',')} hasReplyMarkup=${!!inlineKeyboard} replyMarkupGenerated=${!!inlineKeyboard} buttonSourceMessageId=${message.id}`);
          for (let b = 0; b < buttonsForMsg.length; b++) {
            const btn = buttonsForMsg[b];
            const cb = keyboard.flat().find((k: any) => k?.text?.includes(btn.text))?.callback_data || keyboard.flat().find((k: any) => k?.text?.includes(btn.text))?.url || '(none)';
            logger.info(`[SchedMsg] BUTTON #${b + 1} msg=${msg.id} [${i + 1}] childMsgId=${message.id} type=${(btn.type || 'URL').toUpperCase()} text="${btn.text}" value="${(btn.value || '').substring(0, 80)}" callback="${cb}"`);
          }
        } else {
          logger.info(`[SchedMsg] KEYBOARD msg=${msg.id} [${i + 1}/${messages.length}] childMsgId=${message.id} buttonCount=0 hasReplyMarkup=false replyMarkupGenerated=false`);
        }

        // Build extra with thread, entities, reply_markup — pass directly to Telegram
        const extra: any = {};
        if (threadId) extra.message_thread_id = threadId;
        if (finalInlineKeyboard) extra.reply_markup = finalInlineKeyboard;

        // Pass entities directly — do NOT sanitize (entities are stored as-is)
        if (message.entities && Array.isArray(message.entities) && message.entities.length > 0) {
          extra.entities = message.entities;
        }

        // Log generated reply_markup before sending
        logger.info(`[SchedMsg] PRE_SEND msg=${msg.id} [${i + 1}/${messages.length}] method=${message.mediaFileId ? message.type : 'sendMessage'} hasReplyMarkup=${!!finalInlineKeyboard} keyboardSource=childMsg:${message.id} buttons=${buttonsForMsg.length} reply_markup=${JSON.stringify(finalInlineKeyboard || {}).substring(0, 200)}`);

        try {
          // Handle forward messages — same as Post sendSingleMessage
          if (message.type === 'forward' && message.forwardSource) {
            const fs = message.forwardSource as any;
            const srcChatId = Number(fs.originChatId || fs.chatId);
            const srcMsgId = Number(fs.originMessageId || fs.messageId);
            if (srcChatId && srcMsgId && !isNaN(srcChatId) && !isNaN(srcMsgId)) {
              try {
                await this.bot.telegram.forwardMessage(chatId, srcChatId, srcMsgId);
                logger.info(`[SchedMsg] SEND_OK msg=${msg.id} [${i + 1}] method=forwardMessage srcChat=${srcChatId} srcMsg=${srcMsgId}`);
              } catch (fwdErr: any) {
                // Fallback to copyMessage
                try {
                  await this.bot.telegram.copyMessage(chatId, srcChatId, srcMsgId);
                  logger.info(`[SchedMsg] SEND_OK msg=${msg.id} [${i + 1}] method=copyMessage srcChat=${srcChatId} srcMsg=${srcMsgId}`);
                } catch (copyErr: any) {
                  logger.error(`[SchedMsg] FORWARD_FAILED msg=${msg.id} [${i + 1}] forward and copy both failed: ${copyErr?.message}`);
                  throw copyErr;
                }
              }
            } else {
              logger.warn(`[SchedMsg] FORWARD_SKIP msg=${msg.id} [${i + 1}] invalid forward metadata`);
            }
          } else if (message.mediaFileId) {
            // Media message — pass caption_entities
            const captionExtra: any = { ...extra };
            if (message.captionEntities && Array.isArray(message.captionEntities) && message.captionEntities.length > 0) {
              captionExtra.caption_entities = message.captionEntities;
            }
            captionExtra.caption = message.text || '';

            switch (message.type) {
              case 'photo': await this.bot.telegram.sendPhoto(chatId, message.mediaFileId, captionExtra); break;
              case 'video': await this.bot.telegram.sendVideo(chatId, message.mediaFileId, captionExtra); break;
              case 'document': await this.bot.telegram.sendDocument(chatId, message.mediaFileId, captionExtra); break;
              case 'voice': await this.bot.telegram.sendVoice(chatId, message.mediaFileId, captionExtra); break;
              case 'audio': await this.bot.telegram.sendAudio(chatId, message.mediaFileId, captionExtra); break;
              case 'animation': await this.bot.telegram.sendAnimation(chatId, message.mediaFileId, captionExtra); break;
              case 'sticker': await this.bot.telegram.sendSticker(chatId, message.mediaFileId, extra); break;
              case 'video_note': await this.bot.telegram.sendVideoNote(chatId, message.mediaFileId, extra); break;
              default: await this.bot.telegram.sendMessage(chatId, message.text || '(empty)', extra);
            }
          } else {
            // Text message — pass entities directly
            await this.bot.telegram.sendMessage(chatId, message.text || '(empty)', extra);
          }
          logger.info(`[SchedMsg] SEND_OK msg=${msg.id} [${i + 1}] Telegram API SUCCESS`);
        } catch (sendErr: any) {
          logger.error(`[SchedMsg] SEND_ERROR msg=${msg.id} [${i + 1}] Telegram API ERROR: ${sendErr?.message || sendErr}`, { error: sendErr?.response || sendErr });
          throw sendErr;
        }

        if (messages.length > 1) await sleep(100);
      }

      // After successful send
      const nextSendAt = (msg.intervalMinutes && msg.startTime)
        ? computeNextDue(msg.intervalMinutes, msg.startTime, new Date())
        : null;

      await prisma.scheduledMessage.update({
        where: { id: msg.id },
        data: { lastSentAt: new Date(), nextSendAt, sendCount: { increment: 1 } },
      });

      logger.info(`[SchedMsg] SEND_OK msg=${msg.id} | lastSentAt=NOW | sendCount=${(msg.sendCount || 0) + 1} | nextSendAt=${nextSendAt?.toISOString() ?? 'NULL'}`);

      await scheduledMessageRepository.logDelivery({
        scheduledMessageId: msg.id, targetChatId: msg.targetChatId, targetTopicId: msg.targetTopicId, status: 'SUCCESS',
      });
    } catch (error: any) {
      const errMsg = error?.message || String(error);
      logger.error(`[SchedMsg] SEND_FAIL msg=${msg.id} error="${errMsg}"`);

      if (error?.response?.parameters?.retry_after) {
        const waitSec = error.response.parameters.retry_after;
        logger.warn(`[SchedMsg] FLOOD_WAIT msg=${msg.id} retryAfter=${waitSec}s`);
        await prisma.scheduledMessage.update({
          where: { id: msg.id },
          data: { nextSendAt: new Date(Date.now() + waitSec * 1000) },
        });
      }

      await scheduledMessageRepository.logDelivery({
        scheduledMessageId: msg.id, targetChatId: msg.targetChatId, targetTopicId: msg.targetTopicId, status: 'FAILED', errorMessage: errMsg.slice(0, 900),
      });
    }
  }

  /**
   * Convert DB buttons to Telegram inline_keyboard format.
   * Uses the same renderer as Post system (buildTelegramKeyboard from telegram-native-renderer).
   */
  private buildInlineKeyboard(buttons: any[], entityId?: number): any[][] {
    // Build DENSE grid (no sparse arrays) to match renderer loop indices
    // Sort by row, col first to ensure proper placement
    const sorted = [...buttons].sort((a, b) => (a.row ?? 0) - (b.row ?? 0) || (a.col ?? 0) - (b.col ?? 0));
    const grid: any[] = [];
    for (const btn of sorted) {
      const row = btn.row ?? 0;
      const col = btn.col ?? 0;
      if (!grid[row]) grid[row] = [];
      grid[row][col] = {
        text: btn.text || '',
        type: (btn.type || 'URL').toUpperCase(),
        value: btn.value || '',
        style: btn.style || undefined,
      };
    }
    // Compact: remove empty rows and columns to ensure dense array for renderer
    const compacted = grid
      .filter(Boolean)
      .map(row => row.filter(Boolean));
    if (compacted.length === 0) return [];
    logger.info(`[SchedMsgKB] Built keyboard grid: ${compacted.length} rows, types=${sorted.map(b => (b.type || 'URL').toUpperCase()).join(',')}`);
    return buildTelegramKeyboard(compacted, entityId ?? 0, 'sched');
  }

  // ─── Test Send (same pipeline) ──────────────────────────

  async testSend(id: number) {
    const msg = await scheduledMessageRepository.findById(id);
    if (!msg) throw new Error('Post not found');

    // Check if bindings exist or fallback to targetChatId
    const bindings = await prisma.scheduledMessageBinding.findMany({
      where: { scheduledMessageId: id, isActive: true },
    });
    if (bindings.length === 0 && !msg.targetChatId) throw new Error('No bindings and no targetChatId');
    if ((msg.messages?.length || 0) === 0) throw new Error('No messages');

    logger.info(`[SchedMsg] TEST_SEND msg=${id} bindings=${bindings.length}`);
    await this.sendToGroup(msg);
  }

  // ─── Debug / Status ─────────────────────────────────────

  async getSchedulerStatus(id: number) {
    const msg = await scheduledMessageRepository.findById(id);
    if (!msg) return null;

    const now = new Date();
    const nextDue = (msg.intervalMinutes && msg.startTime)
      ? computeNextDue(msg.intervalMinutes, msg.startTime, msg.lastSentAt)
      : null;
    const { due, reason } = isDue(msg, now);
    const diffMs = nextDue ? nextDue.getTime() - now.getTime() : null;
    const diffMin = diffMs != null ? Math.round(diffMs / 60000) : null;

    return {
      id: msg.id,
      title: msg.title,
      startTime: msg.startTime,
      intervalMinutes: msg.intervalMinutes,
      lastSentAt: msg.lastSentAt?.toISOString() ?? 'never',
      nextSendAtDB: msg.nextSendAt?.toISOString() ?? 'NULL',
      nextDueCalculated: nextDue?.toISOString() ?? 'NULL',
      diffMinutes: diffMin,
      isDue: due,
      reason,
      sendCount: msg.sendCount,
      targetChatId: msg.targetChatId?.toString() ?? 'NULL',
      targetTopicId: msg.targetTopicId?.toString() ?? 'NULL',
    };
  }

  // ─── Emergency Stop ──────────────────────────────────────

  async emergencyStop() {
    return scheduledMessageRepository.disableAll();
  }

  async getStats() {
    return scheduledMessageRepository.getStats();
  }

  async getLogs(messageId: number, limit?: number) {
    return scheduledMessageRepository.getLogs(messageId, limit);
  }
}

export const scheduledMessageService = new ScheduledMessageService();
