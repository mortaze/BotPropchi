import { logger } from '../../utils/logger';

export type RendererType = 'native' | 'legacy';

export class RendererResolver {
  resolve(post: any): RendererType {
    if (post == null) {
      logger.warn('[RendererResolver] post is null/undefined, using legacy');
      return 'legacy';
    }

    if (post.telegramMessageSnapshot) {
      logger.info(`[RendererResolver] post=${post.id} → native (telegramMessageSnapshot)`);
      return 'native';
    }

    if (post.telegramPayload) {
      logger.info(`[RendererResolver] post=${post.id} → native (telegramPayload)`);
      return 'native';
    }

    if (post.entities && Array.isArray(post.entities) && post.entities.length > 0) {
      logger.info(`[RendererResolver] post=${post.id} → native (entities[] length=${post.entities.length})`);
      return 'native';
    }

    if (post.contentFormat === 'telegram_entities') {
      logger.info(`[RendererResolver] post=${post.id} → native (contentFormat=telegram_entities)`);
      return 'native';
    }

    if (post.richEntities && Array.isArray(post.richEntities) && post.richEntities.length > 0) {
      logger.info(`[RendererResolver] post=${post.id} → native (richEntities[] length=${post.richEntities.length})`);
      return 'native';
    }

    if (post.postEntities && Array.isArray(post.postEntities) && post.postEntities.length > 0) {
      logger.info(`[RendererResolver] post=${post.id} → native (postEntities[] length=${post.postEntities.length})`);
      return 'native';
    }

    if (post.contentEntities && Array.isArray(post.contentEntities) && post.contentEntities.length > 0) {
      logger.info(`[RendererResolver] post=${post.id} → native (contentEntities[] length=${post.contentEntities.length})`);
      return 'native';
    }

    if (post.contentText && post.renderMode === 'telegram_entities' && Array.isArray(post.contentEntities) && post.contentEntities.length > 0) {
      logger.info(`[RendererResolver] post=${post.id} → native (contentText + contentEntities[] + renderMode=telegram_entities)`);
      return 'native';
    }

    logger.info(`[RendererResolver] post=${post.id} → legacy (no native data found)`);
    return 'legacy';
  }

  assertNative(post: any): void {
    const result = this.resolve(post);
    if (result !== 'native') {
      logger.warn(`[RendererResolver] post=${post.id} expected native but got ${result}`);
    }
  }
}

export const rendererResolver = new RendererResolver();
