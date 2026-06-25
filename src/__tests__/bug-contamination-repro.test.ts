import { describe, it, expect } from 'vitest';
import { splitPostToMessages } from '../services/post-renderer.service';
import { normalizePost } from '../services/post-normalizer.service';

describe('BUG FIX VERIFICATION: Entity contamination in multi-message posts', () => {

  // ── SCENARIO A: Post with save-time tagging (messageIndex) ──────────
  // Admin-created posts: entities are tagged with messageIndex at save time.
  // The fix (Mode 2) filters by messageIndex === segmentIndex.

  it('A1: 2 messages, both have formatting with messageIndex', () => {
    const post = {
      id: 199,
      content: 'First message with formatting\n\n[[copy]]\nSecond with bold and code\n[[/copy]]',
      entities: [
        { offset: 0, length: 5, type: 'bold', messageIndex: 0 },         // msg 1: "First"
        { offset: 12, length: 4, type: 'bold', messageIndex: 1 },         // msg 2: "bold"
        { offset: 21, length: 4, type: 'code', messageIndex: 1 },         // msg 2: "code"
      ],
      buttons: [],
    };

    const normalized = normalizePost(post);
    const messages = splitPostToMessages(normalized);

    expect(messages.length).toBe(2);
    // Message 0 gets bold@0:5
    expect(messages[0].entities.length).toBe(1);
    expect(messages[0].entities[0].type).toBe('bold');
    expect(messages[0].entities[0].offset).toBe(0);
    // Message 1 gets bold@0:4, code@… (offsets local to msg)
    expect(messages[1].entities.length).toBe(2);
    expect(messages[1].entities[0].type).toBe('bold');
    expect(messages[1].entities[1].type).toBe('code');
  });

  it('A2: 2 messages, only msg 2 has formatting with messageIndex', () => {
    const post = {
      id: 200,
      content: 'Plain text first message\n\n[[copy]]\nFormatted second message\n[[/copy]]',
      entities: [
        { offset: 0, length: 7, type: 'bold', messageIndex: 1 },         // msg 2: "Formatted"
      ],
      buttons: [],
    };

    const normalized = normalizePost(post);
    const messages = splitPostToMessages(normalized);

    expect(messages.length).toBe(2);
    expect(messages[0].entities.length).toBe(0);  // msg 1 has no entities
    expect(messages[1].entities.length).toBe(1);  // msg 2 has 1
    expect(messages[1].entities[0].type).toBe('bold');
  });

  it('A3: 2 messages, only msg 1 has formatting with messageIndex', () => {
    const post = {
      id: 201,
      content: 'Bold first message\n\n[[copy]]\nNo formatting here\n[[/copy]]',
      entities: [
        { offset: 0, length: 4, type: 'bold', messageIndex: 0 },          // msg 1: "Bold"
      ],
      buttons: [],
    };

    const normalized = normalizePost(post);
    const messages = splitPostToMessages(normalized);

    expect(messages.length).toBe(2);
    expect(messages[0].entities.length).toBe(1);
    expect(messages[0].entities[0].type).toBe('bold');
    expect(messages[1].entities.length).toBe(0);
  });

  it('A4: 3 messages, each with own formatting using messageIndex', () => {
    const post = {
      id: 202,
      content: 'First[[copy]]Second[[/copy]][[copy]]Third[[/copy]]',
      entities: [
        { offset: 0, length: 5, type: 'bold', messageIndex: 0 },          // msg 1
        { offset: 0, length: 6, type: 'italic', messageIndex: 1 },         // msg 2
        { offset: 0, length: 5, type: 'underline', messageIndex: 2 },      // msg 3
      ],
      buttons: [],
    };

    const normalized = normalizePost(post);
    const messages = splitPostToMessages(normalized);

    expect(messages.length).toBe(3);
    expect(messages[0].entities.length).toBe(1);
    expect(messages[0].entities[0].type).toBe('bold');
    expect(messages[1].entities.length).toBe(1);
    expect(messages[1].entities[0].type).toBe('italic');
    expect(messages[2].entities.length).toBe(1);
    expect(messages[2].entities[0].type).toBe('underline');
  });

  // ── SCENARIO B: Imported post with snapshot (preserved after content edit) ──
  // The fix preserves telegramMessageSnapshot so Mode 4 can do text-matching.

  it('B1: Imported post with snapshot — entities in both messages', () => {
    const post = {
      id: 203,
      content: 'Message one text\n\n[[copy]]\nMessage two with formatting\n[[/copy]]',
      // post.entities holds stale offsets from before [[copy]] was added
      entities: [],
      buttons: [],
      telegramMessageSnapshot: {
        text: 'Message one text\n\nMessage two with formatting',
        entities: [
          { offset: 0, length: 15, type: 'bold' },          // all of msg 1
          { offset: 17, length: 7, type: 'italic' },         // "Message" in msg 2
          { offset: 30, length: 11, type: 'code' },          // "formatting" in msg 2
        ],
      },
    };

    const normalized = normalizePost(post);
    const messages = splitPostToMessages(normalized);

    console.log('[B1] Messages:', JSON.stringify(messages.map(m => ({
      index: m.index,
      content: m.content,
      entities: m.entities,
    })), null, 2));

    expect(messages.length).toBe(2);
    expect(messages[0].entities.length).toBe(1);
    expect(messages[0].entities[0].type).toBe('bold');
    expect(messages[1].entities.length).toBe(2);
    expect(messages[1].entities[0].type).toBe('italic');
    expect(messages[1].entities[1].type).toBe('code');
  });

  // ── SCENARIO C: Post with PostEntity-style records and source='text' ──────
  // These come from post_entities table. The renderer relies on absolute offset
  // overlap (Mode 3) OR snapshot fallback.

  it('C1: PostEntity records with overlapping absolute offsets', () => {
    const post = {
      id: 204,
      content: 'First message[[copy]]Second message[[/copy]]',
      // Entities from post_entities with source='text' and ABSOLUTE offsets
      entities: [
        { id: 1, source: 'text', type: 'bold', offset: 0, length: 13 },
        { id: 2, source: 'text', type: 'italic', offset: 25, length: 13 },
      ],
      buttons: [],
    };

    const normalized = normalizePost(post);
    const messages = splitPostToMessages(normalized);

    expect(messages.length).toBe(2);
    // Segment 0 at offset 0: bold@0 overlaps → msg 0 gets bold
    expect(messages[0].entities.length).toBe(1);
    expect(messages[0].entities[0].type).toBe('bold');
    // Segment 1 at offset 21 (after [[copy]]): italic@25 overlaps → msg 1 gets italic
    expect(messages[1].entities.length).toBe(1);
    expect(messages[1].entities[0].type).toBe('italic');
  });
});
