import { FormattedMessage, MessageEntity, MediaItem } from './types';
import { normalizeEntities } from './normalizer';
import { validateFormatting } from './validator';

export interface TelegramApiRequest {
  method: string;
  [key: string]: any;
}

export function serializeMessage(msg: FormattedMessage): TelegramApiRequest[] {
  const requests: TelegramApiRequest[] = [];
  const text = msg.text || '';
  const entities = msg.text ? normalizeEntities(text, msg.entities || []) : undefined;

  const request: TelegramApiRequest = {
    method: 'sendMessage',
    text: text || '(empty)',
  };

  if (entities && entities.length > 0) {
    request.entities = entities;
  }

  if (msg.caption) {
    const captionEntities = normalizeEntities(msg.caption, msg.caption_entities || []);
    request.caption = msg.caption;
    if (captionEntities.length > 0) {
      request.caption_entities = captionEntities;
    }
  }

  requests.push(request);
  return requests;
}

export function serializeMediaGroup(media: MediaItem[]): TelegramApiRequest {
  return {
    method: 'sendMediaGroup',
    media: media.map((m, i) => ({
      type: m.type,
      media: m.fileId,
      caption: i === 0 ? (m.caption || undefined) : undefined,
      caption_entities: i === 0 ? normalizeEntities(m.caption || '', m.caption_entities || []) : undefined,
    })),
  };
}

export function serializeSingleMedia(
  media: MediaItem,
  caption?: string,
  captionEntities?: MessageEntity[],
): TelegramApiRequest {
  const methodMap: Record<string, string> = {
    photo: 'sendPhoto',
    video: 'sendVideo',
    animation: 'sendAnimation',
    document: 'sendDocument',
    audio: 'sendAudio',
    voice: 'sendVoice',
  };

  const request: TelegramApiRequest = {
    method: methodMap[media.type] || 'sendDocument',
    media: media.fileId,
  };

  if (caption) {
    request.caption = caption;
    const entities = normalizeEntities(caption, captionEntities || []);
    if (entities.length > 0) {
      request.caption_entities = entities;
    }
  }

  return request;
}

export function requestToTelegramApi(request: TelegramApiRequest): any {
  const out: any = {};
  for (const [key, value] of Object.entries(request)) {
    if (key === 'method') continue;
    if (value !== undefined && value !== null) {
      out[key] = value;
    }
  }
  return out;
}
