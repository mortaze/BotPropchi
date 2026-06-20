import { logger } from '../../utils/logger';
import { TelegramNativeRenderer, telegramLength, cleanEntities } from './telegram-native-renderer.service';
import { telegramRequestValidator } from './telegram-request-validator.service';
import { telegramSnapshotComparator } from './telegram-snapshot-comparator.service';

export class DeliveryDebugService {
  getFullPipelineDebug(post: any): {
    pipeline: string[];
    renderer: string;
    dbContent: any;
    entities: any;
    captionEntities: any;
    parseMode: string | null;
    telegramPayload: any;
    telegramMessageSnapshot: any;
    finalTelegramApiRequest: any;
    detectedRenderer: string;
    validationResult: { valid: boolean; issues: string[] };
    snapshotComparison: any;
  } {
    const pipeline: string[] = [];

    pipeline.push(`[Pipeline] post=${post.id} title="${post.title}" status=${post.status}`);
    pipeline.push(`[Pipeline] telegramPayload=${!!post.telegramPayload} telegramMessageSnapshot=${!!post.telegramMessageSnapshot}`);
    pipeline.push(`[Pipeline] entities=${Array.isArray(post.entities) ? post.entities.length : typeof post.entities} contentFormat=${post.contentFormat}`);
    pipeline.push(`[Pipeline] richEntities=${Array.isArray(post.richEntities) ? post.richEntities.length : 'N/A'} postEntities=${Array.isArray(post.postEntities) ? post.postEntities.length : 'N/A'}`);

    pipeline.push(`[Pipeline] rendererChoice=native`);

    const nativeRenderer = new TelegramNativeRenderer();
    const rendered = nativeRenderer.render(post);
    const finalRequest = nativeRenderer.buildRequest(post);

    pipeline.push(`[Renderer] type=${rendered.renderer}`);
    pipeline.push(`[Renderer] textLength=${telegramLength(rendered.text)} captionLength=${telegramLength(rendered.caption || '')}`);
    pipeline.push(`[Renderer] textEntities=${rendered.textEntities?.length || 0} captionEntities=${rendered.captionEntities?.length || 0}`);
    if (rendered.textEntities?.length) {
      pipeline.push(`[Renderer] textEntityTypes=${rendered.textEntities.map((e: any) => e.type).join(',')}`);
    }
    if (rendered.captionEntities?.length) {
      pipeline.push(`[Renderer] captionEntityTypes=${rendered.captionEntities.map((e: any) => e.type).join(',')}`);
    }
    pipeline.push(`[Renderer] media=${rendered.media.length} buttons=${rendered.buttons.length}`);

    pipeline.push(`[Snapshot] exists=${!!post.telegramMessageSnapshot}`);
    pipeline.push(`[Payload] exists=${!!post.telegramPayload}`);

    pipeline.push(`[Entities] json=${Array.isArray(post.entities) ? post.entities.length : 'N/A'}`);
    pipeline.push(`[Entities] rendered=${rendered.textEntities?.length || 0}`);
    pipeline.push(`[Entities] caption=${rendered.captionEntities?.length || 0}`);

    pipeline.push(`[FinalRequest] method=${finalRequest.method}`);
    if (finalRequest.entities) pipeline.push(`[FinalRequest] entities=${finalRequest.entities.length}`);
    if (finalRequest.caption_entities) pipeline.push(`[FinalRequest] caption_entities=${finalRequest.caption_entities.length}`);
    if (finalRequest.parse_mode) pipeline.push(`[FinalRequest] parse_mode=${finalRequest.parse_mode} ⚠`);

    const validationIssues = finalRequest
      ? telegramRequestValidator.validate(finalRequest)
      : ['[FinalRequest] null/undefined'];

    const textValidation = telegramRequestValidator.validateEntities(rendered.text, rendered.textEntities);
    const captionValidation = telegramRequestValidator.validateEntities(rendered.caption, rendered.captionEntities);

    const comparison = telegramSnapshotComparator.compare(post);

    return {
      pipeline,
      renderer: 'native',
      dbContent: {
        title: post.title,
        content: post.content,
        caption: post.caption,
        rawContent: post.rawContent,
        renderedContent: post.renderedContent,
        contentFormat: post.contentFormat,
      },
      entities: {
        post: post.entities,
        textEntities: rendered.textEntities,
        captionEntities: rendered.captionEntities,
      },
      captionEntities: rendered.captionEntities,
      parseMode: post.parseMode,
      telegramPayload: post.telegramPayload,
      telegramMessageSnapshot: post.telegramMessageSnapshot,
      finalTelegramApiRequest: finalRequest,
      detectedRenderer: rendered.renderer,
      validationResult: {
        valid: textValidation.length + captionValidation.length + validationIssues.length === 0,
        issues: [...textValidation, ...captionValidation, ...validationIssues],
      },
      snapshotComparison: comparison,
    };
  }

  logFullPipeline(post: any): void {
    const debug = this.getFullPipelineDebug(post);
    for (const line of debug.pipeline) {
      logger.info(line);
    }
    if (debug.validationResult.issues.length > 0) {
      debug.validationResult.issues.forEach(issue => logger.warn(`[Validation] ${issue}`));
    }
  }
}

export const deliveryDebugService = new DeliveryDebugService();
