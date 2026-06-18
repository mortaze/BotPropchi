import { FormattedMessage, MessageEntity } from './types';

export type ParseMode = 'markdown' | 'html' | 'none';

export interface ParseResult {
  text: string;
  entities: MessageEntity[];
}

const MARKDOWN_BOLD = /\*\*(.+?)\*\*/g;
const MARKDOWN_ITALIC = /\*(.+?)\*/g;
const MARKDOWN_UNDERLINE = /__(.+?)__/g;
const MARKDOWN_STRIKETHROUGH = /~(.+?)~/g;
const MARKDOWN_SPOILER = /\|\|(.+?)\|\|/g;
const MARKDOWN_CODE = /`([^`]+)`/g;
const MARKDOWN_PRE = /```(\w*)\n([\s\S]*?)```/g;
const MARKDOWN_LINK = /\[([^\]]+)\]\(([^)]+)\)/g;

export function parseMarkdown(text: string): ParseResult {
  const entities: MessageEntity[] = [];
  let clean = text;

  const preBlocks: { full: string; lang: string; code: string; index: number }[] = [];
  let preMatch: RegExpExecArray | null;
  const preRe = /```(\w*)\n([\s\S]*?)```/g;
  while ((preMatch = preRe.exec(text)) !== null) {
    preBlocks.push({ full: preMatch[0], lang: preMatch[1], code: preMatch[2], index: preMatch.index });
  }

  for (const pre of preBlocks) {
    entities.push({
      type: 'pre',
      offset: pre.index,
      length: pre.full.length,
      language: pre.lang || undefined,
    });
  }

  const inlineEntities: { type: string; match: string; offset: number; length: number; url?: string }[] = [];
  const strippedText = text.replace(/```(\w*)\n[\s\S]*?```/g, (match) => ' '.repeat(match.length));

  let match: RegExpExecArray | null;

  const re = MarkdownBold;
  while ((match = re.exec(strippedText)) !== null) {
    inlineEntities.push({ type: 'bold', match: match[0], offset: match.index, length: match[0].length });
  }
  const reItalic = /\*(.+?)\*/g;
  while ((match = reItalic.exec(strippedText)) !== null) {
    if (!inlineEntities.some(e => e.type === 'bold' && e.offset === match!.index)) {
      inlineEntities.push({ type: 'italic', match: match[0], offset: match.index, length: match[0].length });
    }
  }
  const reUnderline = /__(.+?)__/g;
  while ((match = reUnderline.exec(strippedText)) !== null) {
    inlineEntities.push({ type: 'underline', match: match[0], offset: match.index, length: match[0].length });
  }
  const reStrike = /~(.+?)~/g;
  while ((match = reStrike.exec(strippedText)) !== null) {
    inlineEntities.push({ type: 'strikethrough', match: match[0], offset: match.index, length: match[0].length });
  }
  const reSpoiler = /\|\|(.+?)\|\|/g;
  while ((match = reSpoiler.exec(strippedText)) !== null) {
    inlineEntities.push({ type: 'spoiler', match: match[0], offset: match.index, length: match[0].length });
  }
  const reCode = /`([^`]+)`/g;
  while ((match = reCode.exec(strippedText)) !== null) {
    inlineEntities.push({ type: 'code', match: match[0], offset: match.index, length: match[0].length });
  }

  const reLink = /\[([^\]]+)\]\(([^)]+)\)/g;
  while ((match = reLink.exec(strippedText)) !== null) {
    inlineEntities.push({ type: 'text_link', match: match[0], offset: match.index, length: match[0].length, url: match[2] });
  }

  for (const ie of inlineEntities) {
    entities.push({
      type: ie.type as any,
      offset: ie.offset,
      length: ie.length,
      url: ie.url,
    });
  }

  entities.sort((a, b) => a.offset - b.offset);

  return { text: clean, entities };
}

const MarkdownBold = /\*\*(.+?)\*\*/g;

export function parseMessageContent(
  text: string,
  sourceFormat?: 'markdown' | 'html' | 'entities' | 'none',
  existingEntities?: MessageEntity[],
): ParseResult {
  if (!text) return { text: '', entities: [] };

  if (sourceFormat === 'entities' && existingEntities) {
    return { text, entities: [...existingEntities] };
  }

  if (sourceFormat === 'markdown') {
    return parseMarkdown(text);
  }

  if (sourceFormat === 'html') {
    return parseHtmlToEntities(text);
  }

  return { text, entities: existingEntities || [] };
}

export interface SerializedContent {
  text: string;
  entities: MessageEntity[];
  renderMode: 'telegram_entities' | 'markdown' | 'html' | 'none';
}

export function prepareTelegramPayload(
  text: string,
  entities?: MessageEntity[] | null,
  renderMode?: string | null,
): SerializedContent {
  if (renderMode === 'telegram_entities' || renderMode === 'entities') {
    return {
      text,
      entities: entities || [],
      renderMode: 'telegram_entities',
    };
  }

  if (renderMode === 'html') {
    return parseHtmlContent(text);
  }

  if (renderMode === 'markdown' || !renderMode) {
    if (entities && entities.length > 0) {
      return { text, entities, renderMode: 'telegram_entities' };
    }
    return parseMarkdownContent(text);
  }

  return { text, entities: entities || [], renderMode: 'none' };
}

function parseMarkdownContent(text: string): SerializedContent {
  const result = parseMarkdown(text);
  return {
    text: result.text,
    entities: result.entities,
    renderMode: result.entities.length > 0 ? 'telegram_entities' : 'none',
  };
}

function parseHtmlContent(text: string): SerializedContent {
  const result = parseHtmlToEntities(text);
  return {
    text: result.text,
    entities: result.entities,
    renderMode: result.entities.length > 0 ? 'telegram_entities' : 'none',
  };
}

export function stripFormatting(text: string, format: 'markdown' | 'html'): string {
  if (format === 'markdown') {
    return text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/~(.+?)~/g, '$1')
      .replace(/\|\|(.+?)\|\|/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/```(\w*)\n[\s\S]*?```/g, '$2')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
  }
  if (format === 'html') {
    return text.replace(/<[^>]+>/g, '');
  }
  return text;
}

interface HtmlTag {
  tag: string;
  offset: number;
  length: number;
  attrs: Record<string, string>;
}

function parseHtmlToEntities(html: string): ParseResult {
  const entities: MessageEntity[] = [];
  let text = html;

  const tagStack: { tag: string; offset: number; entity?: Partial<MessageEntity> }[] = [];
  const tagRegex = /<\/?([a-zA-Z0-9_-]+)([^>]*)>/g;
  let match: RegExpExecArray | null;
  let textOffset = 0;
  let lastEnd = 0;

  const fullTags: { open: HtmlTag; close: HtmlTag; entity: Partial<MessageEntity> }[] = [];

  while ((match = tagRegex.exec(html)) !== null) {
    const fullTag = match[0];
    const tagName = match[1].toLowerCase();
    const isClosing = fullTag.startsWith('</');
    const attrsStr = match[2];
    const tagOffset = match.index;

    textOffset = tagOffset;

    if (!isClosing) {
      const attrs: Record<string, string> = {};
      const attrRe = /(\w+)=["']([^"']*)["']/g;
      let attrMatch: RegExpExecArray | null;
      while ((attrMatch = attrRe.exec(attrsStr)) !== null) {
        attrs[attrMatch[1]] = attrMatch[2];
      }
      tagStack.push({ tag: tagName, offset: textOffset, entity: parseHtmlTagToEntity(tagName, attrs) });
    } else {
      for (let i = tagStack.length - 1; i >= 0; i--) {
        if (tagStack[i].tag === tagName) {
          const openTag = tagStack.splice(i, 1)[0];
          const contentStart = openTag.offset;
          const contentEnd = tagOffset + fullTag.length;
          const openTagLength = html.slice(openTag.offset).indexOf('>') + 1;
          const contentTextStart = openTag.offset + openTagLength;
          const innerText = html.slice(contentTextStart, tagOffset);
          const innerTextLen = innerText.length;

          if (openTag.entity && innerTextLen > 0) {
            fullTags.push({
              open: { tag: tagName, offset: contentStart, length: openTagLength, attrs: {} },
              close: { tag: tagName, offset: tagOffset, length: fullTag.length, attrs: {} },
              entity: { ...openTag.entity, offset: contentTextStart, length: innerTextLen },
            });
          }
          break;
        }
      }
    }
  }

  text = html.replace(/<[^>]+>/g, '');

  for (const ft of fullTags) {
    if (ft.entity.offset !== undefined && ft.entity.length !== undefined) {
      entities.push({
        type: (ft.entity.type || 'bold') as any,
        offset: ft.entity.offset,
        length: ft.entity.length,
        url: ft.entity.url,
        language: ft.entity.language,
        custom_emoji_id: ft.entity.custom_emoji_id,
      });
    }
  }

  entities.sort((a, b) => a.offset - b.offset);

  return { text, entities };
}

function parseHtmlTagToEntity(tag: string, attrs: Record<string, string>): Partial<MessageEntity> | null {
  switch (tag) {
    case 'b':
    case 'strong': return { type: 'bold' };
    case 'i':
    case 'em': return { type: 'italic' };
    case 'u':
    case 'ins': return { type: 'underline' };
    case 's':
    case 'strike':
    case 'del': return { type: 'strikethrough' };
    case 'span':
    case 'tg-spoiler': return { type: 'spoiler' };
    case 'code': return { type: 'code' };
    case 'pre': return { type: 'pre', language: attrs.language };
    case 'a': return { type: 'text_link', url: attrs.href };
    case 'tg-emoji': return { type: 'custom_emoji', custom_emoji_id: attrs['emoji-id'] };
    case 'blockquote': return { type: 'blockquote' };
    default: return null;
  }
}
