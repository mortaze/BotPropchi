import { logger } from '../../utils/logger';

export type RendererType = 'native';

export class RendererResolver {
  resolve(post: any): RendererType {
    if (post == null) {
      logger.warn('[RendererResolver] post is null/undefined, returning native');
    }
    // ALL posts use unified native renderer — no legacy split.
    // The normalizePost() layer ensures all posts have consistent
    // content, entities, buttons, and media before reaching here.
    return 'native';
  }

  assertNative(post: any): void {
    // Always native — no assertion needed.
  }
}

export const rendererResolver = new RendererResolver();
