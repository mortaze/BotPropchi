import { FormattedMessage, MessageEntity, MediaItem } from './types';
import { normalizeEntities } from './normalizer';
import { validateFormatting } from './validator';
import { serializeMessage, serializeMediaGroup, serializeSingleMedia, TelegramApiRequest } from './serializer';

export interface RenderedOutput {
  text?: string;
  entities?: MessageEntity[];
  caption?: string;
  caption_entities?: MessageEntity[];
  media?: MediaItem[];
}

export function renderMessage(msg: FormattedMessage): RenderedOutput {
  const output: RenderedOutput = {};

  if (msg.text) {
    output.text = msg.text;
    output.entities = normalizeEntities(msg.text, msg.entities || []);
  }

  if (msg.caption) {
    output.caption = msg.caption;
    output.caption_entities = normalizeEntities(msg.caption, msg.caption_entities || []);
  }

  return output;
}

export function renderPreview(msg: FormattedMessage, maxLength: number = 200): string {
  const text = msg.caption || msg.text || '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}
