import { Telegraf } from 'telegraf';
import { forumTopicRepository } from '../repositories/forum-topic.repository';
import { logger } from '../utils/logger';

class ForumTopicService {
  private bot?: Telegraf;

  setBot(bot: Telegraf) {
    this.bot = bot;
  }

  /**
   * Called when the bot receives any message in a forum group.
   * Extracts topic info from message_thread_id and creates/updates the topic record.
   */
  async discoverFromMessage(chatId: number | bigint, messageThreadId?: number, topicName?: string) {
    if (!messageThreadId) return;
    const cid = BigInt(chatId);
    const name = topicName || `Topic ${messageThreadId}`;
    try {
      await forumTopicRepository.upsert({ chatId: cid, topicId: messageThreadId, name });
    } catch (error) {
      logger.debug(`[ForumTopic] Failed to discover topic ${messageThreadId} in chat ${chatId}:`, error);
    }
  }

  /**
   * Called when bot receives forum_topic_created service message.
   */
  async onTopicCreated(chatId: number | bigint, topicId: number, name: string) {
    try {
      await forumTopicRepository.upsert({ chatId: BigInt(chatId), topicId, name });
      logger.info(`[ForumTopic] Topic created: ${name} (${topicId}) in chat ${chatId}`);
    } catch (error) {
      logger.error(`[ForumTopic] Failed to create topic ${topicId}:`, error);
    }
  }

  /**
   * Called when bot receives forum_topic_edited service message.
   */
  async onTopicEdited(chatId: number | bigint, topicId: number, name: string) {
    try {
      await forumTopicRepository.renameTopic(BigInt(chatId), topicId, name);
      logger.info(`[ForumTopic] Topic renamed: ${topicId} → ${name} in chat ${chatId}`);
    } catch (error) {
      logger.error(`[ForumTopic] Failed to rename topic ${topicId}:`, error);
    }
  }

  /**
   * Called when bot receives forum_topic_closed service message.
   */
  async onTopicClosed(chatId: number | bigint, topicId: number) {
    try {
      await forumTopicRepository.closeTopic(BigInt(chatId), topicId);
      logger.info(`[ForumTopic] Topic closed: ${topicId} in chat ${chatId}`);
    } catch (error) {
      logger.error(`[ForumTopic] Failed to close topic ${topicId}:`, error);
    }
  }

  /**
   * Called when bot receives forum_topic_reopened service message.
   */
  async onTopicReopened(chatId: number | bigint, topicId: number) {
    try {
      await forumTopicRepository.reopenTopic(BigInt(chatId), topicId);
      logger.info(`[ForumTopic] Topic reopened: ${topicId} in chat ${chatId}`);
    } catch (error) {
      logger.error(`[ForumTopic] Failed to reopen topic ${topicId}:`, error);
    }
  }

  /**
   * Get active topics for a chat (used by scheduled message topic selection).
   */
  async getTopicsForChat(chatId: number | bigint) {
    return forumTopicRepository.findByChatId(BigInt(chatId));
  }

  /**
   * Check if a chat has any active topics.
   */
  async hasTopics(chatId: number | bigint) {
    const count = await forumTopicRepository.countActive(BigInt(chatId));
    return count > 0;
  }
}

export const forumTopicService = new ForumTopicService();
