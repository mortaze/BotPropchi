export type MessageEntityType =
  | 'mention' | 'hashtag' | 'cashtag' | 'bot_command'
  | 'url' | 'email' | 'phone_number'
  | 'bold' | 'italic' | 'underline' | 'strikethrough' | 'spoiler'
  | 'blockquote' | 'expandable_blockquote'
  | 'code' | 'pre'
  | 'text_link' | 'text_mention' | 'custom_emoji';

export interface MessageEntity {
  type: MessageEntityType;
  offset: number;
  length: number;
  url?: string;
  user?: any;
  language?: string;
  custom_emoji_id?: string;
}

export interface FormattedMessage {
  text: string;
  entities?: MessageEntity[];
  caption?: string;
  caption_entities?: MessageEntity[];
}

export interface MediaItem {
  type: 'photo' | 'video' | 'animation' | 'document' | 'audio' | 'voice';
  fileId: string;
  caption?: string;
  caption_entities?: MessageEntity[];
  width?: number;
  height?: number;
  duration?: number;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
}

export interface MessagePayload {
  chatId: number | string;
  text?: string;
  entities?: MessageEntity[];
  caption?: string;
  caption_entities?: MessageEntity[];
  media?: MediaItem[];
  buttons?: any[][];
  link_preview?: boolean;
  protect_content?: boolean;
}

export interface StoredMessage {
  content_text: string;
  content_entities: MessageEntity[];
  render_mode: 'telegram_entities' | 'markdown' | 'html' | 'none';
  preview_text: string;
  version: number;
}

export const ENTITY_TYPE_SET = new Set<MessageEntityType>([
  'mention', 'hashtag', 'cashtag', 'bot_command',
  'url', 'email', 'phone_number',
  'bold', 'italic', 'underline', 'strikethrough', 'spoiler',
  'blockquote', 'expandable_blockquote',
  'code', 'pre',
  'text_link', 'text_mention', 'custom_emoji',
]);

export function telegramLength(text: string): number {
  return Buffer.from(text || '', 'utf16le').length / 2;
}
