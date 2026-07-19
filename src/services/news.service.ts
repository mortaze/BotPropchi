import { prisma } from '../prisma/client';
import { TELEGRAM_MESSAGE_TEXT_MAX } from '../utils/unicode';
import { validateEntities, validateStyleEntities, TelegramEntity } from './post-message.service';
import { keyToUtcMidnight, utcDateToKey, DateKey } from '../utils/news-date';

export const newsService = {
  async getEntry(dateKey: DateKey) {
    const date = keyToUtcMidnight(dateKey);
    return prisma.newsCalendarEntry.findUnique({ where: { date } });
  },

  async upsertEntry(dateKey: DateKey, text: string, entities: TelegramEntity[], adminTelegramId: bigint) {
    if (text.length > TELEGRAM_MESSAGE_TEXT_MAX) {
      throw new Error(`TEXT_TOO_LONG: ${text.length} > ${TELEGRAM_MESSAGE_TEXT_MAX}`);
    }
    const validated = validateStyleEntities(validateEntities(text, entities));
    const date = keyToUtcMidnight(dateKey);
    return prisma.newsCalendarEntry.upsert({
      where: { date },
      create: { date, text, entities: validated as any, updatedByAdminId: adminTelegramId },
      update: { text, entities: validated as any, updatedByAdminId: adminTelegramId },
    });
  },

  async clearEntry(dateKey: DateKey) {
    const date = keyToUtcMidnight(dateKey);
    await prisma.newsCalendarEntry.deleteMany({ where: { date } });
  },

  async getDatesWithContentInMonth(year: number, month: number): Promise<Set<DateKey>> {
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 0, 23, 59, 59));
    const rows = await prisma.newsCalendarEntry.findMany({
      where: { date: { gte: from, lte: to } },
      select: { date: true },
    });
    return new Set(rows.map(r => utcDateToKey(r.date)));
  },
};
