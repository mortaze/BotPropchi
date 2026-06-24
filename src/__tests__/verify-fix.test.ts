import { describe, it, expect } from 'vitest';

// ─── Import the ACTUAL fixed functions from the codebase ──────────
import { splitPostToMessages } from '../services/post-renderer.service';
import { normalizePost } from '../services/post-normalizer.service';

describe('FIX VERIFICATION: Entity Inheritance Contamination', () => {

  // ─── Test 1: Same text in both messages, empty entities, snapshot fallback ─
  it('FIX: No contamination when post.entities is empty and snapshot has entities', () => {
    const post = {
      id: 9991,
      content: 'Welcome\n\n[[copy]]\nWelcome\n[[/copy]]',
      entities: [],
      buttons: [],
      telegramMessageSnapshot: {
        text: 'Welcome\n\nWelcome',
        entities: [
          { offset: 0, length: 7, type: 'bold' },   // First "Welcome"
          { offset: 9, length: 7, type: 'italic' },   // Second "Welcome"
        ],
      },
    };

    const normalized = normalizePost(post);
    const messages = splitPostToMessages(normalized);

    console.log('[FIX VERIFY] Test 1 - Messages:', JSON.stringify(messages.map(m => ({
      index: m.index,
      content: m.content,
      entities: m.entities,
    })), null, 2));

    expect(messages.length).toBe(2);

    // Message 0 should have BOLD entity (from first "Welcome" at snapshot offset 0)
    expect(messages[0].entities.length).toBeGreaterThan(0);
    expect(messages[0].entities[0].type).toBe('bold');
    expect(messages[0].entities[0].offset).toBe(0);

    // Message 1 should have ITALIC entity (from second "Welcome" at snapshot offset 9)
    // NOT bold! This was the contamination: indexOf returned 0 for both.
    expect(messages[1].entities.length).toBeGreaterThan(0);
    expect(messages[1].entities[0].type).toBe('italic');
    expect(messages[1].entities[0].offset).toBe(0);
  });

  // ─── Test 2: Entity length mismatch (trailing whitespace trimmed) ─
  it('FIX: Entity extending 1 char beyond trimmed segment is still included (clamped)', () => {
    const post = {
      id: 9992,
      content: 'Hello World\n\n[[copy]]\nHello World\n[[/copy]]',
      // entity for msg 1 has length 12 (includes trailing \n) but segment is 11 chars (trimmed)
      entities: [
        { offset: 0, length: 11, type: 'bold' },    // msg 0 "Hello World"
        { offset: 22, length: 12, type: 'italic' },  // msg 1 "Hello World\n" (1 char too long)
      ],
      buttons: [],
    };

    const normalized = normalizePost(post);
    const messages = splitPostToMessages(normalized);

    console.log('[FIX VERIFY] Test 2 - Messages:', JSON.stringify(messages.map(m => ({
      index: m.index,
      content: m.content,
      entities: m.entities,
    })), null, 2));

    expect(messages.length).toBe(2);

    // Message 0 should get bold
    expect(messages[0].entities.length).toBe(1);
    expect(messages[0].entities[0].type).toBe('bold');

    // Message 1 should get italic (with clamped length = 11, not 12)
    expect(messages[1].entities.length).toBe(1);
    expect(messages[1].entities[0].type).toBe('italic');
    expect(messages[1].entities[0].length).toBe(11); // Clamped from 12 to 11
  });

  // ─── Test 3: post.entities takes priority (no snapshot fallback needed) ─
  it('FIX: post.entities matched correctly for both segments', () => {
    const post = {
      id: 9993,
      content: 'First[[copy]]Second[[/copy]]',
      entities: [
        { offset: 0, length: 5, type: 'bold' },      // "First"
        { offset: 13, length: 6, type: 'italic' },    // "Second"
      ],
      buttons: [],
      telegramMessageSnapshot: {
        text: 'FirstSecond',
        entities: [
          { offset: 0, length: 11, type: 'blockquote' }, // spans both
        ],
      },
    };

    const normalized = normalizePost(post);
    const messages = splitPostToMessages(normalized);

    console.log('[FIX VERIFY] Test 3 - Messages:', JSON.stringify(messages.map(m => ({
      index: m.index,
      content: m.content,
      entities: m.entities,
    })), null, 2));

    expect(messages.length).toBe(2);
    expect(messages[0].entities.length).toBe(1);
    expect(messages[0].entities[0].type).toBe('bold');
    expect(messages[1].entities.length).toBe(1);
    expect(messages[1].entities[0].type).toBe('italic');

    // Blockquote from snapshot should NOT appear (post.entities takes priority)
    const allEntityTypes = [...messages[0].entities, ...messages[1].entities].map((e: any) => e.type);
    expect(allEntityTypes).not.toContain('blockquote');
  });

  // ─── Test 4: Different text in each message, snapshot fallback ─
  it('FIX: No contamination with different text and snapshot fallback', () => {
    const post = {
      id: 9994,
      content: 'Hello[[copy]]World[[/copy]]',
      entities: [],
      buttons: [],
      telegramMessageSnapshot: {
        text: 'HelloWorld',
        entities: [
          { offset: 0, length: 5, type: 'bold' },
          { offset: 5, length: 5, type: 'italic' },
        ],
      },
    };

    const normalized = normalizePost(post);
    const messages = splitPostToMessages(normalized);

    console.log('[FIX VERIFY] Test 4 - Messages:', JSON.stringify(messages.map(m => ({
      index: m.index,
      content: m.content,
      entities: m.entities,
    })), null, 2));

    expect(messages.length).toBe(2);
    expect(messages[0].entities.length).toBe(1);
    expect(messages[0].entities[0].type).toBe('bold');
    expect(messages[1].entities.length).toBe(1);
    expect(messages[1].entities[0].type).toBe('italic');
  });

  // ─── Test 5: Three messages with the same text ─
  it('FIX: 3 messages with identical text - each gets correct entities', () => {
    const post = {
      id: 9995,
      content: 'Hi[[copy]]\nHi\n[[/copy]][[copy]]\nHi\n[[/copy]]',
      entities: [],
      buttons: [],
      telegramMessageSnapshot: {
        text: 'Hi\n\nHi\n\nHi',
        entities: [
          { offset: 0, length: 2, type: 'bold' },
          { offset: 4, length: 2, type: 'italic' },
          { offset: 8, length: 2, type: 'underline' },
        ],
      },
    };

    const normalized = normalizePost(post);
    const messages = splitPostToMessages(normalized);

    console.log('[FIX VERIFY] Test 5 - Messages:', JSON.stringify(messages.map(m => ({
      index: m.index,
      content: m.content,
      entities: m.entities,
    })), null, 2));

    expect(messages.length).toBe(3);
    expect(messages[0].entities.length).toBeGreaterThan(0);
    expect(messages[0].entities[0].type).toBe('bold');
    expect(messages[1].entities.length).toBeGreaterThan(0);
    expect(messages[1].entities[0].type).toBe('italic');
    expect(messages[2].entities.length).toBeGreaterThan(0);
    expect(messages[2].entities[0].type).toBe('underline');
  });

  // ─── Test 6: Persian text (RTL) with same content in both messages ─
  it('FIX: Persian text with duplicate content - no inheritance', () => {
    const post = {
      id: 9996,
      content: 'سلام\n\n[[copy]]\nسلام\n[[/copy]]',
      entities: [],
      buttons: [],
      telegramMessageSnapshot: {
        text: 'سلام\n\nسلام',
        entities: [
          { offset: 0, length: 4, type: 'bold' },
          { offset: 6, length: 4, type: 'italic' },
        ],
      },
    };

    const normalized = normalizePost(post);
    const messages = splitPostToMessages(normalized);

    console.log('[FIX VERIFY] Test 6 - Persian Messages:', JSON.stringify(messages.map(m => ({
      index: m.index,
      content: m.content,
      content_len: m.content.length,
      snapshot_text: m.snapshot?.text,
      entities: m.entities,
    })), null, 2));

    expect(messages.length).toBe(2);
    expect(messages[0].entities.length).toBe(1);
    expect(messages[0].entities[0].type).toBe('bold');
    expect(messages[1].entities.length).toBe(1);
    expect(messages[1].entities[0].type).toBe('italic');
  });
});
