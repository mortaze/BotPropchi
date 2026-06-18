import { logger } from '../../utils/logger';
import { TelegramNativeRenderer, cleanEntities, telegramLength } from './telegram-native-renderer.service';
import { telegramRequestValidator } from './telegram-request-validator.service';

export class TelegramSnapshotComparator {
  compare(post: any): {
    originalTelegramSnapshot: any;
    renderedOutput: any;
    differences: {
      modifiedText: boolean;
      lostEntities: any[];
      lostCaptionEntities: any[];
      offsetMismatch: boolean;
      missingQuote: boolean;
    };
  } {
    const renderer = new TelegramNativeRenderer();
    const rendered = renderer.render(post);
    const finalRequest = renderer.buildRequest(post);

    const original = post.telegramMessageSnapshot || post.telegramPayload || {};
    const originalText = original.text ?? original.caption ?? post.telegramPayload?.text;
    const finalText = finalRequest.text ?? finalRequest.caption ?? finalRequest.media?.[0]?.caption;
    const originalEntities = cleanEntities(original.entities ?? post.telegramPayload?.entities) || [];
    const originalCaptionEntities = cleanEntities(original.caption_entities ?? post.telegramPayload?.captionEntities) || [];
    const sentEntities = cleanEntities(finalRequest.entities) || [];
    const sentCaptionEntities = cleanEntities(finalRequest.caption_entities ?? finalRequest.media?.[0]?.caption_entities) || [];

    const diff = {
      modifiedText: originalText !== undefined && originalText !== finalText,
      lostEntities: originalEntities.filter((e: any) => !sentEntities.some((s: any) => JSON.stringify(s) === JSON.stringify(e))),
      lostCaptionEntities: originalCaptionEntities.filter((e: any) => !sentCaptionEntities.some((s: any) => JSON.stringify(s) === JSON.stringify(e))),
      offsetMismatch: [...sentEntities, ...sentCaptionEntities].some((e: any) => telegramRequestValidator.validateEntities(finalText || '', [e]).length > 0),
      missingQuote: [...originalEntities, ...originalCaptionEntities].some((e: any) => e.type === 'blockquote' || e.type === 'expandable_blockquote') && ![...sentEntities, ...sentCaptionEntities].some((e: any) => e.type === 'blockquote' || e.type === 'expandable_blockquote'),
    };

    return {
      originalTelegramSnapshot: original,
      renderedOutput: finalRequest,
      differences: diff,
    };
  }

  logDifferences(postId: number, result: ReturnType<TelegramSnapshotComparator['compare']>): void {
    if (result.differences.modifiedText) {
      logger.warn(`[TelegramSnapshotComparator] post=${postId} TEXT MODIFIED`);
    }
    if (result.differences.lostEntities.length > 0) {
      logger.warn(`[TelegramSnapshotComparator] post=${postId} LOST ${result.differences.lostEntities.length} entities: ${JSON.stringify(result.differences.lostEntities)}`);
    }
    if (result.differences.lostCaptionEntities.length > 0) {
      logger.warn(`[TelegramSnapshotComparator] post=${postId} LOST ${result.differences.lostCaptionEntities.length} caption_entities: ${JSON.stringify(result.differences.lostCaptionEntities)}`);
    }
    if (result.differences.offsetMismatch) {
      logger.warn(`[TelegramSnapshotComparator] post=${postId} OFFSET MISMATCH`);
    }
    if (result.differences.missingQuote) {
      logger.warn(`[TelegramSnapshotComparator] post=${postId} MISSING QUOTE`);
    }
  }
}

export const telegramSnapshotComparator = new TelegramSnapshotComparator();
