import { describe, expect, it } from 'vitest';
import { TelegramNativeRenderer, comparePostNativeRoundtrip, extractTelegramSnapshot } from '../services/post-renderer.service';

function postFromMessage(message: any) {
  const snapshot = extractTelegramSnapshot(message);
  return {
    id: 1,
    title: 'Native',
    content: message.text,
    caption: message.caption,
    entities: message.caption ? snapshot.captionEntities : snapshot.entities,
    telegramPayload: { text: snapshot.text, caption: snapshot.caption, entities: snapshot.entities, captionEntities: snapshot.captionEntities, media: snapshot.media, keyboard: snapshot.keyboard, rawMessage: snapshot.rawMessage },
    telegramMessageSnapshot: snapshot.message,
    parseMode: 'HTML',
  };
}

const cases = [
  ['quote', { message_id: 1, text: 'quoted text', entities: [{ type: 'blockquote', offset: 0, length: 11 }] }],
  ['nested quote', { message_id: 2, text: 'quote bold', entities: [{ type: 'blockquote', offset: 0, length: 10 }, { type: 'bold', offset: 6, length: 4 }] }],
  ['quote + link', { message_id: 3, text: 'quote link', entities: [{ type: 'blockquote', offset: 0, length: 10 }, { type: 'text_link', offset: 6, length: 4, url: 'https://example.com' }] }],
  ['bold', { message_id: 4, text: 'bold', entities: [{ type: 'bold', offset: 0, length: 4 }] }],
  ['italic', { message_id: 5, text: 'italic', entities: [{ type: 'italic', offset: 0, length: 6 }] }],
  ['underline', { message_id: 6, text: 'underline', entities: [{ type: 'underline', offset: 0, length: 9 }] }],
  ['spoiler', { message_id: 7, text: 'spoiler', entities: [{ type: 'spoiler', offset: 0, length: 7 }] }],
  ['code', { message_id: 8, text: 'code', entities: [{ type: 'code', offset: 0, length: 4 }] }],
  ['pre', { message_id: 9, text: 'const a = 1', entities: [{ type: 'pre', offset: 0, length: 11, language: 'ts' }] }],
  ['custom emoji', { message_id: 10, text: '🙂', entities: [{ type: 'custom_emoji', offset: 0, length: 2, custom_emoji_id: '123' }] }],
  ['link', { message_id: 11, text: 'example', entities: [{ type: 'text_link', offset: 0, length: 7, url: 'https://example.com' }] }],
  ['mixed entities', { message_id: 12, text: 'bold italic #tag @name https://x.test', entities: [{ type: 'bold', offset: 0, length: 4 }, { type: 'italic', offset: 5, length: 6 }, { type: 'hashtag', offset: 12, length: 4 }, { type: 'mention', offset: 17, length: 5 }, { type: 'url', offset: 23, length: 14 }] }],
  ['expandable blockquote', { message_id: 13, text: 'expand me', entities: [{ type: 'expandable_blockquote', offset: 0, length: 9 }] }],
];

describe('TelegramNativeRenderer', () => {
  it.each(cases as Array<[string, any]>)('roundtrips %s native entities without parse_mode', (_name, message) => {
    const req = new TelegramNativeRenderer().buildRequest(postFromMessage(message));
    expect(req.method).toBe('sendMessage');
    expect(req.parse_mode).toBeUndefined();
    expect(req.entities).toEqual(message.entities);
    expect(req).toMatchSnapshot();
  });

  it('roundtrips media caption entities', () => {
    const message = { message_id: 20, photo: [{ file_id: 'small' }, { file_id: 'large', file_unique_id: 'u' }], caption: 'caption bold', caption_entities: [{ type: 'bold', offset: 8, length: 4 }] };
    const req = new TelegramNativeRenderer().buildRequest(postFromMessage(message));
    expect(req.method).toBe('sendPhoto');
    expect(req.parse_mode).toBeUndefined();
    expect(req.caption_entities).toEqual(message.caption_entities);
  });

  it('roundtrips albums through native caption_entities', () => {
    const post = postFromMessage({ message_id: 30, text: 'album caption', entities: [{ type: 'bold', offset: 0, length: 5 }] });
    post.telegramPayload.media = [{ type: 'photo', fileId: 'a' }, { type: 'photo', fileId: 'b' }];
    const req = new TelegramNativeRenderer().buildRequest(post);
    expect(req.method).toBe('sendMediaGroup');
    expect(req.media[0].caption_entities).toEqual(post.telegramPayload.entities);
    expect(req.media[0].parse_mode).toBeUndefined();
  });

  it('reports no differences for quote + bold + link + custom emoji', () => {
    const message = { message_id: 40, text: 'quote bold link 🙂', entities: [{ type: 'blockquote', offset: 0, length: 17 }, { type: 'bold', offset: 6, length: 4 }, { type: 'text_link', offset: 11, length: 4, url: 'https://example.com' }, { type: 'custom_emoji', offset: 16, length: 2, custom_emoji_id: 'emoji' }] };
    expect(comparePostNativeRoundtrip(postFromMessage(message)).differences).toEqual({ modifiedText: false, lostEntities: [], lostCaptionEntities: [], offsetMismatch: false, missingQuote: false });
  });
});
