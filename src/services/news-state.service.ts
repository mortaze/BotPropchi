import { cache } from '../utils/cache';

const PREFIX = 'news:';

function newsKey(userId: number, field: string) {
  return `${PREFIX}${userId}:${field}`;
}

const FIELDS = ['current_month', 'editing_date', 'awaiting_text', 'message_id', 'current_viewed_date'];

export const newsState = {
  getState(userId: number) {
    return {
      currentMonth: cache.get<string>(newsKey(userId, 'current_month')),
      editingDate: cache.get<string>(newsKey(userId, 'editing_date')),
      awaitingText: cache.get<boolean>(newsKey(userId, 'awaiting_text')),
      messageId: cache.get<number>(newsKey(userId, 'message_id')),
      currentViewedDate: cache.get<string>(newsKey(userId, 'current_viewed_date')),
    };
  },

  setCurrentMonth(userId: number, ym: string) {
    cache.setPermanent(newsKey(userId, 'current_month'), ym);
  },

  setEditing(userId: number, dateKey: string) {
    cache.setPermanent(newsKey(userId, 'editing_date'), dateKey);
  },

  setAwaitingText(userId: number, value: boolean) {
    cache.setPermanent(newsKey(userId, 'awaiting_text'), value);
  },

  setMessageId(userId: number, msgId: number) {
    cache.setPermanent(newsKey(userId, 'message_id'), msgId);
  },

  setCurrentViewedDate(userId: number, dateKey: string) {
    cache.setPermanent(newsKey(userId, 'current_viewed_date'), dateKey);
  },

  clearAll(userId: number) {
    for (const field of FIELDS) {
      cache.del(newsKey(userId, field));
    }
  },
};
