import { describe, it, expect } from 'vitest';
import {
  validateEntities,
  validateMessages,
  sanitizeEntities,
  normalizeSingleMessage,
  buildTelegramPayload,
} from '../services/post-message.service';
import { normalizeEntities, telegramLength } from '../shared/message-format/normalizer';

function snap(label: string, text: string, entities: any[]) {
  console.log(`\n  ${label}:`);
  console.log(`    text: ${JSON.stringify(text)}`);
  console.log(`    textLen: ${text.length} (JS) / ${telegramLength(text)} (telegram)`);
  console.log(`    entities: ${JSON.stringify(entities)}`);
  for (const e of entities) {
    const fragment = text.substring(e.offset, e.offset + e.length);
    console.log(`      [${e.type}] offset=${e.offset} length=${e.length} url=${e.url || '-'} fragment="${fragment}"`);
  }
}

const scenarios = [
  {
    name: '✅ Simple HTTPS URL',
    text: 'Visit https://example.com now',
    entities: [{ type: 'url', offset: 6, length: 19 }],
  },
  {
    name: '✅ HTTP URL',
    text: 'Visit http://example.com now',
    entities: [{ type: 'url', offset: 6, length: 18 }],
  },
  {
    name: '✅ t.me link',
    text: 'Join https://t.me/xxx',
    entities: [{ type: 'url', offset: 6, length: 15 }],
  },
  {
    name: '✅ tg:// URL',
    text: 'Open tg://user?id=123',
    entities: [{ type: 'url', offset: 5, length: 16 }],
  },
  {
    name: '✅ text_link entity',
    text: 'Click here for info',
    entities: [{ type: 'text_link', offset: 6, length: 4, url: 'https://example.com' }],
  },
  {
    name: '✅ mention entity',
    text: 'Hello @user123 welcome',
    entities: [{ type: 'mention', offset: 6, length: 7 }],
  },
  {
    name: '✅ text_mention entity',
    text: 'Hello user',
    entities: [{ type: 'text_mention', offset: 6, length: 4, user: { id: 123, first_name: 'User' } }],
  },
  {
    name: '✅ custom_emoji',
    text: 'Hello \u{1F525} world',
    entities: [{ type: 'custom_emoji', offset: 6, length: 2, custom_emoji_id: '5368324170671202286' }],
  },
  {
    name: '✅ Bold + URL',
    text: '**hello** https://example.com',
    entities: [
      { type: 'bold', offset: 0, length: 7 },
      { type: 'url', offset: 9, length: 19 },
    ],
  },
  {
    name: '✅ Blockquote',
    text: 'This is a quote',
    entities: [{ type: 'blockquote', offset: 0, length: 15 }],
  },
  {
    name: '✅ Spoiler',
    text: 'Secret info here',
    entities: [{ type: 'spoiler', offset: 0, length: 16 }],
  },
  {
    name: '✅ Persian + URL',
    text: '\u0633\u0644\u0627\u0645 https://example.com',
    entities: [{ type: 'url', offset: 5, length: 19 }],
  },
  {
    name: '✅ Mixed EN/FA + URL',
    text: 'Hello \u0633\u0644\u0627\u0645 https://example.com',
    entities: [{ type: 'url', offset: 11, length: 19 }],
  },
  {
    name: '✅ Emoji + URL',
    text: '\u{1F525} https://example.com',
    entities: [{ type: 'url', offset: 2, length: 19 }],
  },
  {
    name: '✅ Multiple URLs',
    text: 'A https://a.com B https://b.com',
    entities: [
      { type: 'url', offset: 2, length: 13 },
      { type: 'url', offset: 18, length: 13 },
    ],
  },
  {
    name: '✅ domain.com without protocol (plain text)',
    text: 'Web:nextgenfunding.com',
    entities: [],
  },
  {
    name: '✅ domain.com with bold',
    text: 'Web: nextgenfunding.com',
    entities: [{ type: 'bold', offset: 4, length: 19 }],
  },
  {
    name: '✅ Two text messages in one post (message 0 has URL, message 1 has domain)',
    text: 'Web: https://nextgenfunding.com',
    entities: [{ type: 'url', offset: 5, length: 25 }],
    isMulti: true,
    text2: 'Web:nextgenfunding.com',
    entities2: [],
  },
];

describe('Entity Pipeline Trace — End-to-End', () => {
  for (const sc of scenarios) {
    it(sc.name, () => {
      console.log(`\n━━━ ${sc.name} ━━━`);

      const text1 = sc.text;
      const ents1 = [...sc.entities];

      snap('① Receive (Telegram Update)', text1, ents1);

      // ─── Step 2: normalizeEntities (normalizer.ts) ───
      const afterNormalize = normalizeEntities(text1, ents1 as any);
      snap('② normalizeEntities()', text1, afterNormalize);

      // ─── Step 3: validateEntities (post-message.service) ───
      const afterValidate = validateEntities(text1, ents1 as any, 'test');
      snap('③ validateEntities()', text1, afterValidate);

      // ─── Step 4: simulate DB round-trip (JSON stringify/parse) ───
      const dbStored = JSON.parse(JSON.stringify({ text: text1, entities: ents1 }));
      const afterDbLoad = { text: dbStored.text, entities: Array.isArray(dbStored.entities) ? dbStored.entities : [] };
      snap('④ DB round-trip', afterDbLoad.text, afterDbLoad.entities);

      // ─── Step 5: validateMessages (called in sendPostToChat) ───
      const rows = [{ text: text1, entities: ents1, order: 0 }];
      const validated = validateMessages(rows, 1);
      snap('⑤ validateMessages()', text1, validated[0].entities);

      // ─── Step 6: normalizeSingleMessage (called in sendPostToChat) ───
      const normalized = normalizeSingleMessage({ text: text1, entities: ents1, id: 'test', postId: 1, order: 0, messageType: 'text', captionEntities: [], caption: null, replyMarkup: null, delayMs: 0 });
      snap('⑥ normalizeSingleMessage()', text1, normalized.entities);

      // ─── Step 7: buildTelegramPayload ───
      const payload = buildTelegramPayload(normalized);
      snap('⑦ buildTelegramPayload()', payload.text || '', payload.entities || []);

      // ─── Step 8: sanitizeEntities (called before send) ───
      const sanitized = sanitizeEntities(payload, 'test');
      snap('⑧ sanitizeEntities()', sanitized.text || '', sanitized.entities || []);

      // ─── Final assertion ───
      const originalCount = ents1.length;
      const finalCount = (sanitized.entities || []).length;
      console.log(`\n  ▶ Result: ${originalCount} entities in → ${finalCount} entities out`);

      if (originalCount !== finalCount) {
        console.log(`  ⚠️ ENTITY LOSS DETECTED!`);
        for (const orig of ents1) {
          const found = (sanitized.entities || []).find((e: any) => e.type === orig.type && e.offset === orig.offset && e.length === orig.length);
          if (!found) {
            console.log(`  ❌ LOST: type=${orig.type} offset=${orig.offset} length=${orig.length} url=${orig.url || '-'}`);
          }
        }
      }

      // Verify entities survived
      expect(finalCount).toBe(originalCount);
      for (const orig of ents1) {
        const found = (sanitized.entities || []).find((e: any) => e.type === orig.type && e.offset === orig.offset && e.length === orig.length && (e.url || '') === (orig.url || ''));
        expect(found).toBeDefined();
      }

      // ─── Also test multi-message scenario ───
      if (sc.isMulti && sc.text2 !== undefined) {
        console.log(`\n━━━ Multi-message: message 2 ━━━`);
        const text2 = sc.text2;
        const ents2 = [...(sc.entities2 || [])];
        snap('① Receive', text2, ents2);

        const validated2 = validateMessages([{ text: text2, entities: ents2, order: 1 }], 1);
        snap('⑤ validateMessages()', text2, validated2[0].entities);

        const normalized2 = normalizeSingleMessage({ text: text2, entities: ents2, id: 'test2', postId: 1, order: 1, messageType: 'text', captionEntities: [], caption: null, replyMarkup: null, delayMs: 0 });
        snap('⑥ normalizeSingleMessage()', text2, normalized2.entities);

        const payload2 = buildTelegramPayload(normalized2);
        snap('⑦ buildTelegramPayload()', payload2.text || '', payload2.entities || []);

        const sanitized2 = sanitizeEntities(payload2, 'test2');
        snap('⑧ sanitizeEntities()', sanitized2.text || '', sanitized2.entities || []);

        console.log(`\n  ▶ Result: ${ents2.length} in → ${(sanitized2.entities || []).length} out`);
      }
    });
  }
});
