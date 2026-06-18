import { Markup } from 'telegraf';
import { logger } from '../utils/logger';
import {
  RendererResolver,
  TelegramNativeRenderer,
  telegramRequestValidator,
  telegramSnapshotComparator,
  deliveryDebugService,
  extractTelegramSnapshot,
  telegramLength,
  cleanEntities,
  nonEmptyEntities,
  cloneJson,
  buildTelegramKeyboard,
} from './renderer';
import { sendFormattedMessage } from '../shared/message-format';

const MEDIA_SENDERS: Record<string, { inputType: string; method: string; apiMethod: string }> = {
  photo: { inputType: 'photo', method: 'replyWithPhoto', apiMethod: 'sendPhoto' },
  video: { inputType: 'video', method: 'replyWithVideo', apiMethod: 'sendVideo' },
  animation: { inputType: 'animation', method: 'replyWithAnimation', apiMethod: 'sendAnimation' },
  document: { inputType: 'document', method: 'replyWithDocument', apiMethod: 'sendDocument' },
  audio: { inputType: 'audio', method: 'replyWithAudio', apiMethod: 'sendAudio' },
  voice: { inputType: 'voice', method: 'replyWithVoice', apiMethod: 'sendVoice' },
};

export function validateTelegramHtml(html?: string | null): string[] {
  return telegramRequestValidator.validateHtml(html);
}

export function validateTelegramEntities(text: string | null | undefined, entities: any[] | null | undefined): string[] {
  return telegramRequestValidator.validateEntities(text, entities);
}

export { TelegramNativeRenderer, extractTelegramSnapshot };

export function buildTelegramKeyboardLegacy(buttons: any[] | null | undefined, postId?: number): any[][] {
  return buildTelegramKeyboard(buttons, postId);
}

export function buildPostDebugSnapshot(post: any) {
  const debug = deliveryDebugService.getFullPipelineDebug(post);
  return {
    dbContent: debug.dbContent,
    entities: debug.entities,
    captionEntities: debug.captionEntities,
    parseMode: debug.parseMode,
    telegramPayload: debug.telegramPayload,
    telegramMessageSnapshot: debug.telegramMessageSnapshot,
    finalTelegramApiRequest: debug.finalTelegramApiRequest,
    detectedRenderer: debug.detectedRenderer,
    entityValidationResult: debug.validationResult,
  };
}

export function comparePostNativeRoundtrip(post: any) {
  return telegramSnapshotComparator.compare(post);
}

export async function renderPostToTelegram(ctx: any, post: any) {
  const resolver = new RendererResolver();
  const rendererChoice = resolver.resolve(post);

  logger.info(`[Pipeline] post=${post.id} resolve=${rendererChoice}`);

  if (rendererChoice === 'legacy') {
    logger.warn(`[Pipeline] post=${post.id} no native data, cannot render natively`);
    return false;
  }

  deliveryDebugService.logFullPipeline(post);

  const nativeRenderer = new TelegramNativeRenderer();
  const rendered = nativeRenderer.render(post);
  const finalRequest = nativeRenderer.buildRequest(post);

  const validationIssues = telegramRequestValidator.validate(finalRequest);
  if (validationIssues.length > 0) {
    logger.error(`[Pipeline] post=${post.id} validation FAILED: ${validationIssues.join('; ')}`);
    return false;
  }

  const comparator = telegramSnapshotComparator.compare(post);
  if (comparator.differences.modifiedText || comparator.differences.lostEntities.length > 0 || comparator.differences.lostCaptionEntities.length > 0) {
    logger.warn(`[Pipeline] post=${post.id} snapshot comparison found differences`);
    telegramSnapshotComparator.logDifferences(post.id, comparator);
  }

  const buttons = rendered.buttons;

  if (rendered.media.length > 1) {
    logger.info(`[TelegramSend] post=${post.id} sendMediaGroup items=${rendered.media.length}`);
    await ctx.replyWithMediaGroup(finalRequest.media);
    if (buttons.length) await ctx.reply('عملیات:', Markup.inlineKeyboard(buttons));
    return true;
  }

  if (rendered.media.length === 1) {
    const m = rendered.media[0];
    if (m.type === 'sticker') {
      logger.info(`[TelegramSend] post=${post.id} sendSticker`);
      await ctx.replyWithSticker(m.fileId, buttons.length ? Markup.inlineKeyboard(buttons) : undefined);
      return true;
    }
    const sender = MEDIA_SENDERS[m.type] || MEDIA_SENDERS.document;
    const { method, media, ...extra } = finalRequest;
    logger.info(`[TelegramSend] post=${post.id} ${sender.apiMethod}`);
    await ctx[sender.method](media, extra);
    return true;
  }

  const { method, text, ...request } = finalRequest;
  const entityTypes = (request.entities || []).map((e: any) => `${e.type}@${e.offset}:${e.length}`).join(',');
  logger.info(`[TelegramSend] post=${post.id} sendMessage textLength=${telegramLength(text || '')} entities=${(request.entities || []).length} entityTypes=[${entityTypes}]`);

  await sendFormattedMessage(ctx, {
    text: text || '',
    entities: request.entities,
  }, {
    buttons,
  });
  return true;
}
