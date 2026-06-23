// src/services/user-event.service.ts
// سرویس ردیابی کامل رویدادهای کاربر

import { prisma } from '../prisma/client';
import { logger } from '../utils/logger';

const MAX_MESSAGE_LENGTH = 4000;

export const userEventService = {
  // ثبت رویداد
  async recordEvent(params: {
    userId: number;
    telegramId: bigint;
    eventType: string;
    eventData?: Record<string, any>;
  }) {
    try {
      return await prisma.userEvent.create({
        data: {
          userId: params.userId,
          telegramId: params.telegramId,
          eventType: params.eventType,
          eventData: params.eventData ?? undefined,
        },
      });
    } catch (err) {
      logger.error(`[UserEvent] recordEvent failed: userId=${params.userId} type=${params.eventType}`, err);
    }
  },

  // ثبت پیام
  async recordMessage(params: {
    userId: number;
    telegramId: bigint;
    messageId?: number;
    messageType: string;
    text?: string;
    rawUpdate?: any;
  }) {
    try {
      // Truncate long messages
      const truncatedText = params.text
        ? params.text.length > MAX_MESSAGE_LENGTH
          ? params.text.slice(0, MAX_MESSAGE_LENGTH) + '...'
          : params.text
        : undefined;

      return await prisma.userMessageHistory.create({
        data: {
          userId: params.userId,
          telegramId: params.telegramId,
          messageId: params.messageId,
          messageType: params.messageType,
          text: truncatedText,
          rawUpdate: params.rawUpdate ?? undefined,
        },
      });
    } catch (err) {
      logger.error(`[UserEvent] recordMessage failed: userId=${params.userId} type=${params.messageType}`, err);
    }
  },

  // دریافت رویدادهای کاربر
  async getUserEvents(userId: number, params: { page?: number; limit?: number; eventType?: string }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 50));
    const where: any = { userId };
    if (params.eventType) where.eventType = params.eventType;

    const [items, total] = await Promise.all([
      prisma.userEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.userEvent.count({ where }),
    ]);

    return { items, total, pages: Math.ceil(total / limit) };
  },

  // دریافت پیام‌های کاربر
  async getUserMessages(userId: number, params: { page?: number; limit?: number; messageType?: string }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 50));
    const where: any = { userId };
    if (params.messageType) where.messageType = params.messageType;

    const [items, total] = await Promise.all([
      prisma.userMessageHistory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.userMessageHistory.count({ where }),
    ]);

    return { items, total, pages: Math.ceil(total / limit) };
  },

  // دریافت Timeline کاربر
  async getUserTimeline(userId: number, limit: number = 100) {
    const [events, messages] = await Promise.all([
      prisma.userEvent.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.userMessageHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          messageType: true,
          text: true,
          messageId: true,
          createdAt: true,
        },
      }),
    ]);

    // Merge and sort by time
    const timeline: Array<{
      type: 'event' | 'message';
      id: number;
      label: string;
      detail: string;
      timestamp: string;
      rawData: any;
    }> = [];

    for (const e of events) {
      timeline.push({
        type: 'event',
        id: e.id,
        label: e.eventType,
        detail: JSON.stringify(e.eventData || {}),
        timestamp: e.createdAt.toISOString(),
        rawData: e.eventData,
      });
    }

    for (const m of messages) {
      timeline.push({
        type: 'message',
        id: m.id,
        label: m.messageType,
        detail: m.text || '',
        timestamp: m.createdAt.toISOString(),
        rawData: { messageId: m.messageId },
      });
    }

    timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return timeline.slice(0, limit);
  },
};

// Event type labels for display
export const EVENT_TYPE_LABELS: Record<string, string> = {
  BOT_START: 'شروع ربات',
  BOT_RESTARTED: 'شروع مجدد',
  BUTTON_CLICK: 'کلیک دکمه',
  INLINE_BUTTON_CLICK: 'کلیک دکمه اینلاین',
  MENU_OPEN: 'باز کردن منو',
  MESSAGE_SENT: 'ارسال پیام',
  TEXT_MESSAGE: 'پیام متنی',
  PHOTO_MESSAGE: 'پیام عکس',
  VIDEO_MESSAGE: 'پیام ویدیو',
  VOICE_MESSAGE: 'پیام صوتی',
  DOCUMENT_MESSAGE: 'پیام فایل',
  CONTACT_SHARED: 'اشتراک‌گذاری مخاطب',
  LOCATION_SHARED: 'اشتراک‌گذاری موقعیت',
  PROFILE_VIEW: 'مشاهده پروفایل',
  POST_VIEW: 'مشاهده پست',
  LOTTERY_VIEW: 'مشاهده قرعه‌کشی',
  LOTTERY_JOIN: 'شرکت در قرعه‌کشی',
  REFERRAL_CREATED: 'ایجاد دعوت',
  REFERRAL_SUCCESS: 'دعوت موفق',
  SETTINGS_OPEN: 'باز کردن تنظیمات',
  UNKNOWN_ACTION: 'عملیات ناشناخته',
};
