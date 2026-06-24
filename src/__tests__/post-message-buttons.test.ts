import { describe, it, expect, vi } from 'vitest';

// ─── Replicate the button helper functions from post-handlers.ts ─────

function ensureMessagesFormat(raw: any): any {
  if (!raw) return raw;
  if (typeof raw === 'object' && !Array.isArray(raw) && raw.messages) return raw;
  if (Array.isArray(raw)) return { messages: { '0': raw } };
  return raw;
}

function getMessageButtons(raw: any, messageIdx: number): any[][] {
  if (!raw) return [];
  if (typeof raw === 'object' && !Array.isArray(raw) && raw.messages) {
    return raw.messages[String(messageIdx)] || [];
  }
  if (Array.isArray(raw)) return messageIdx === 0 ? raw : [];
  return [];
}

function setMessageButtons(raw: any, messageIdx: number, buttons: any[][]): any {
  const formatted = ensureMessagesFormat(raw);
  const result: any = { messages: {} };
  if (formatted && formatted.messages) {
    for (const [k, v] of Object.entries(formatted.messages)) {
      result.messages[k] = v;
    }
  }
  result.messages[String(messageIdx)] = buttons;
  return result;
}

function swapMessageButtons(raw: any, idxA: number, idxB: number): any {
  const formatted = ensureMessagesFormat(raw);
  if (!formatted || !formatted.messages) return raw;
  const msgs = { ...formatted.messages };
  const a = String(idxA);
  const b = String(idxB);
  const temp = msgs[a];
  msgs[a] = msgs[b];
  msgs[b] = temp;
  return { messages: msgs };
}

function removeMessageButtons(raw: any, messageIdx: number): any {
  const formatted = ensureMessagesFormat(raw);
  if (!formatted || !formatted.messages) return raw;
  const msgs: any = {};
  const keys = Object.keys(formatted.messages).sort((a, b) => Number(a) - Number(b));
  let skip = String(messageIdx);
  let shift = 0;
  for (const k of keys) {
    if (k === skip) { shift = 1; continue; }
    msgs[String(Number(k) - shift)] = formatted.messages[k];
  }
  if (formatted.messages['_shared']) {
    msgs['_shared'] = formatted.messages['_shared'];
  }
  return { messages: msgs };
}

// ─── Replicate post-normalizer helpers ─────────────────────────────

function extractButtons(post: any): any {
  if (post.buttons !== undefined) {
    return JSON.parse(JSON.stringify(post.buttons));
  }
  if (post.keyboards && Array.isArray(post.keyboards) && post.keyboards.length > 0) {
    const rows: any[][] = [];
    for (const kb of post.keyboards) {
      if (!rows[kb.row]) rows[kb.row] = [];
      rows[kb.row][kb.col] = { text: kb.text, type: kb.type || 'URL', value: kb.value || '' };
    }
    return rows;
  }
  if (post.telegramPayload?.keyboard && Array.isArray(post.telegramPayload.keyboard)) {
    return JSON.parse(JSON.stringify(post.telegramPayload.keyboard));
  }
  if (post.telegramMessageSnapshot?.reply_markup?.inline_keyboard) {
    return JSON.parse(JSON.stringify(post.telegramMessageSnapshot.reply_markup.inline_keyboard));
  }
  return [];
}

// ─── Replicate splitContentMessages from post-renderer.service.ts ──

function splitContentMessages(content: string): string[] {
  if (!content || !content.trim()) return [];
  const messages: string[] = [];
  const regex = /\[\[copy\]\](.*?)\[\[\/copy\]\]/gs;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const before = content.slice(lastIndex, match.index).trim();
      if (before) messages.push(before);
    }
    messages.push(match[1].trim());
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex).trim();
    if (remaining) messages.push(remaining);
  }
  if (messages.length === 0 && content.trim()) messages.push(content.trim());
  return messages;
}

function serializePostMessages(messages: string[]): string {
  if (messages.length === 0) return '';
  if (messages.length === 1) return messages[0] || '';
  while (messages.length > 1 && messages[messages.length - 1].trim() === '') {
    messages.pop();
  }
  if (messages.length === 1) return messages[0] || '';
  const segments = messages.map((msg, i) => {
    if (i === 0) return msg;
    return `[[copy]]\n${msg}\n[[/copy]]`;
  });
  return segments.join('\n\n');
}

// ══════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════

describe('ensureMessagesFormat', () => {
  it('converts array to messages format', () => {
    const input = [[{ text: 'Btn1', type: 'URL', value: 'https://example.com' }]];
    const result = ensureMessagesFormat(input);
    expect(result).toEqual({ messages: { '0': input } });
  });

  it('passes through messages format', () => {
    const input = { messages: { '0': [[{ text: 'Btn1' }]], '1': [[{ text: 'Btn2' }]] } };
    const result = ensureMessagesFormat(input);
    expect(result).toBe(input);
  });

  it('returns null/undefined as-is', () => {
    expect(ensureMessagesFormat(null)).toBeNull();
    expect(ensureMessagesFormat(undefined)).toBeUndefined();
  });

  it('handles empty array', () => {
    expect(ensureMessagesFormat([])).toEqual({ messages: { '0': [] } });
  });
});

describe('getMessageButtons', () => {
  const msgFormat = {
    messages: {
      '0': [[{ text: 'Btn0', type: 'URL' }]],
      '1': [[{ text: 'Btn1', type: 'URL' }], [{ text: 'Btn1b', type: 'URL' }]],
      '_shared': [[{ text: 'Shared', type: 'URL' }]],
    },
  };

  it('returns buttons for specific message index', () => {
    expect(getMessageButtons(msgFormat, 0)).toEqual([[{ text: 'Btn0', type: 'URL' }]]);
    expect(getMessageButtons(msgFormat, 1)).toEqual([[{ text: 'Btn1', type: 'URL' }], [{ text: 'Btn1b', type: 'URL' }]]);
  });

  it('returns empty for missing message index (no _shared fallback)', () => {
    expect(getMessageButtons(msgFormat, 99)).toEqual([]);
  });

  it('extracts message 0 buttons from array format', () => {
    const arrFormat = [[{ text: 'Btn', type: 'URL' }]];
    expect(getMessageButtons(arrFormat, 0)).toEqual([[{ text: 'Btn', type: 'URL' }]]);
  });

  it('returns empty for non-zero messages in array format', () => {
    const arrFormat = [[{ text: 'Btn', type: 'URL' }]];
    expect(getMessageButtons(arrFormat, 1)).toEqual([]);
  });

  it('returns empty for null/undefined input', () => {
    expect(getMessageButtons(null, 0)).toEqual([]);
    expect(getMessageButtons(undefined, 0)).toEqual([]);
  });

  it('handles empty messages object', () => {
    expect(getMessageButtons({ messages: {} }, 0)).toEqual([]);
  });

  it('handles single message with nested arrays', () => {
    const input = { messages: { '0': [[{ text: 'A' }], [{ text: 'B' }]] } };
    expect(getMessageButtons(input, 0)).toEqual([[{ text: 'A' }], [{ text: 'B' }]]);
  });
});

describe('setMessageButtons', () => {
  it('preserves existing messages and updates specified one', () => {
    const input = { messages: { '0': [[{ text: 'Old0' }]], '1': [[{ text: 'Old1' }]] } };
    const result = setMessageButtons(input, 1, [[{ text: 'New1' }]]);
    expect(result.messages['0']).toEqual([[{ text: 'Old0' }]]);
    expect(result.messages['1']).toEqual([[{ text: 'New1' }]]);
  });

  it('converts array format to messages and updates', () => {
    const input = [[{ text: 'Old' }]];
    const result = setMessageButtons(input, 0, [[{ text: 'New' }]]);
    expect(result.messages['0']).toEqual([[{ text: 'New' }]]);
  });

  it('preserves _shared key', () => {
    const input = { messages: { '0': [[{ text: 'A' }]], '_shared': [[{ text: 'S' }]] } };
    const result = setMessageButtons(input, 0, [[{ text: 'B' }]]);
    expect(result.messages['_shared']).toEqual([[{ text: 'S' }]]);
  });

  it('adds new message index when it does not exist', () => {
    const input = { messages: { '0': [[{ text: 'A' }]] } };
    const result = setMessageButtons(input, 1, [[{ text: 'B' }]]);
    expect(result.messages['1']).toEqual([[{ text: 'B' }]]);
  });
});

describe('swapMessageButtons', () => {
  it('swaps buttons between two messages', () => {
    const input = { messages: { '0': [[{ text: 'A' }]], '1': [[{ text: 'B' }]] } };
    const result = swapMessageButtons(input, 0, 1);
    expect(result.messages['0']).toEqual([[{ text: 'B' }]]);
    expect(result.messages['1']).toEqual([[{ text: 'A' }]]);
  });

  it('converts array format before swapping', () => {
    const input = [[{ text: 'A' }]];
    const result = swapMessageButtons(input, 0, 1);
    // Array format becomes { messages: { '0': [[{text:'A'}]] } }
    // Swapping 0 and 1 means 0 gets undefined, 1 gets A
    expect(result.messages['1']).toEqual([[{ text: 'A' }]]);
    expect(result.messages['0']).toBeUndefined();
  });

  it('preserves _shared during swap', () => {
    const input = { messages: { '0': [[{ text: 'A' }]], '1': [[{ text: 'B' }]], '_shared': [[{ text: 'S' }]] } };
    const result = swapMessageButtons(input, 0, 1);
    expect(result.messages['_shared']).toEqual([[{ text: 'S' }]]);
  });
});

describe('removeMessageButtons', () => {
  it('shifts indices after removal', () => {
    const input = { messages: { '0': [[{ text: 'A' }]], '1': [[{ text: 'B' }]], '2': [[{ text: 'C' }]] } };
    const result = removeMessageButtons(input, 1);
    expect(result.messages['0']).toEqual([[{ text: 'A' }]]);
    expect(result.messages['1']).toEqual([[{ text: 'C' }]]);
    expect(result.messages['2']).toBeUndefined();
  });

  it('preserves _shared key after removal', () => {
    const input = { messages: { '0': [[{ text: 'A' }]], '1': [[{ text: 'B' }]], '_shared': [[{ text: 'S' }]] } };
    const result = removeMessageButtons(input, 0);
    expect(result.messages['0']).toEqual([[{ text: 'B' }]]);
    expect(result.messages['_shared']).toEqual([[{ text: 'S' }]]);
  });

  it('removes only message and returns empty messages', () => {
    const input = { messages: { '0': [[{ text: 'A' }]] } };
    const result = removeMessageButtons(input, 0);
    expect(Object.keys(result.messages).filter(k => k !== '_shared').length).toBe(0);
  });

  it('converts array format before removal — array stays as message 0', () => {
    const input = [[{ text: 'A' }], [{ text: 'B' }]];
    const result = removeMessageButtons(input, 0);
    // Array format becomes { messages: { '0': [[{text:'A'}], [{text:'B'}]] } }
    // Removing message 0 removes the only message, leaving empty
    expect(Object.keys(result.messages).filter(k => k !== '_shared').length).toBe(0);
  });
});

describe('extractButtons (normalizer)', () => {
  it('returns array format for single-message post', () => {
    const post = {
      content: 'Hello',
      buttons: [[{ text: 'Btn', type: 'URL', value: 'https://example.com' }]],
    };
    const result = extractButtons(post);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual(post.buttons);
  });

  it('passes through array format for multi-message post (no conversion)', () => {
    const post = {
      content: 'Msg1[[copy]]Msg2[[/copy]]',
      buttons: [[{ text: 'Btn', type: 'URL', value: 'https://example.com' }]],
    };
    const result = extractButtons(post);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual(post.buttons);
  });

  it('passes through messages format for multi-message post', () => {
    const post = {
      content: 'Msg1[[copy]]Msg2[[/copy]]',
      buttons: { messages: { '0': [[{ text: 'Btn0' }]], '1': [[{ text: 'Btn1' }]] } },
    };
    const result = extractButtons(post);
    expect(result).toEqual(post.buttons);
  });

  it('returns empty array for no buttons', () => {
    const post = { content: 'Hello', buttons: undefined };
    const result = extractButtons(post);
    expect(result).toEqual([]);
  });

  it('normalizes keyboards to array format for single message', () => {
    const post = {
      content: 'Hello',
      keyboards: [
        { row: 0, col: 0, text: 'Btn1', type: 'URL', value: 'https://ex.com' },
        { row: 1, col: 0, text: 'Btn2', type: 'URL', value: 'https://ex2.com' },
      ],
    };
    const result = extractButtons(post);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0][0].text).toBe('Btn1');
    expect(result[1][0].text).toBe('Btn2');
  });

  it('normalizes keyboards to array format for multi-message (no messages conversion)', () => {
    const post = {
      content: 'Msg1[[copy]]Msg2[[/copy]]',
      keyboards: [
        { row: 0, col: 0, text: 'Btn1', type: 'URL', value: 'https://ex.com' },
      ],
    };
    const result = extractButtons(post);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0][0].text).toBe('Btn1');
  });
});

describe('splitContentMessages / serializePostMessages roundtrip', () => {
  it('splits single message', () => {
    expect(splitContentMessages('Hello World')).toEqual(['Hello World']);
  });

  it('splits multi-message content', () => {
    const input = 'First message\n[[copy]]\nSecond message\n[[/copy]]\n\n[[copy]]\nThird message\n[[/copy]]';
    const result = splitContentMessages(input);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe('First message');
    expect(result[1]).toBe('Second message');
    expect(result[2]).toBe('Third message');
  });

  it('serializePostMessages roundtrips correctly', () => {
    const original = ['First', 'Second', 'Third'];
    const serialized = serializePostMessages(original);
    const deserialized = splitContentMessages(serialized);
    expect(deserialized).toEqual(original);
  });

  it('handles single message in serialize', () => {
    expect(serializePostMessages(['Only one'])).toBe('Only one');
  });

  it('handles empty messages', () => {
    expect(serializePostMessages([])).toBe('');
    expect(splitContentMessages('')).toEqual([]);
  });
});

describe('Integration: Full multi-message flow', () => {
  const scenario1Post = {
    id: 1,
    title: 'Test Post',
    content: 'First message[[copy]]\nSecond message\n[[/copy]]',
    buttons: { messages: { '0': [[{ text: 'Btn0', type: 'URL', value: 'https://a.com' }]], '1': [[{ text: 'Btn1', type: 'URL', value: 'https://b.com' }]] } },
  };

  it('splits 2 messages correctly with their buttons', () => {
    const messages = splitContentMessages(scenario1Post.content);
    expect(messages).toHaveLength(2);

    const msg0Btns = getMessageButtons(scenario1Post.buttons, 0);
    expect(msg0Btns).toHaveLength(1);
    expect(msg0Btns[0][0].text).toBe('Btn0');

    const msg1Btns = getMessageButtons(scenario1Post.buttons, 1);
    expect(msg1Btns).toHaveLength(1);
    expect(msg1Btns[0][0].text).toBe('Btn1');
  });

  it('preserves ordering after swap', () => {
    const swapped = swapMessageButtons(scenario1Post.buttons, 0, 1);
    expect(getMessageButtons(swapped, 0)[0][0].text).toBe('Btn1');
    expect(getMessageButtons(swapped, 1)[0][0].text).toBe('Btn0');
  });

  it('re-indexes after message removal', () => {
    const removed = removeMessageButtons(scenario1Post.buttons, 0);
    // After removing message 0, the buttons at index 1 shift to index 0
    expect(getMessageButtons(removed, 0)[0][0].text).toBe('Btn1');
    expect(getMessageButtons(removed, 1)).toEqual([]);
  });

  it('handles 5 messages with buttons', () => {
    const content = ['Msg1', 'Msg2', 'Msg3', 'Msg4', 'Msg5'];
    const serialized = serializePostMessages(content);
    const msgs = splitContentMessages(serialized);
    expect(msgs).toEqual(content);

    const buttons: any = { messages: {} };
    for (let i = 0; i < 5; i++) {
      buttons.messages[String(i)] = [[{ text: `Btn${i}`, type: 'URL', value: `https://ex${i}.com` }]];
    }

    for (let i = 0; i < 5; i++) {
      expect(getMessageButtons(buttons, i)[0][0].text).toBe(`Btn${i}`);
    }
  });

  it('normalizer keeps array buttons for multi-message (no conversion)', () => {
    const post = {
      content: 'Msg1[[copy]]Msg2[[/copy]]',
      buttons: [[{ text: 'SharedBtn', type: 'URL', value: 'https://ex.com' }]],
    };
    const result = extractButtons(post);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual(post.buttons);
  });

  it('normalizer keeps array buttons for single message', () => {
    const post = {
      content: 'Single message',
      buttons: [[{ text: 'Btn', type: 'URL', value: 'https://ex.com' }]],
    };
    const result = extractButtons(post);
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── New Data Model: PostMessage, MessageRenderContext ─────────────

interface PostMessage {
  index: number;
  content: string;
  entities: any[];
  buttons: any[][];
  media: any[] | undefined;
  snapshot: any | undefined;
}

interface MessageRenderContext {
  message: PostMessage;
  postId: number;
}

// ─── Replicate splitPostToMessages from post-renderer.service.ts ──

function resolveEntitiesForMessage(
  post: any,
  segment: ContentSegment,
): any[] {
  const fromContent = extractContentEntitiesForSegment(post.entities, segment.offset, segment.text.length);
  if (fromContent.length > 0) return fromContent;
  if (post.telegramMessageSnapshot) {
    return extractSnapshotEntitiesForSegment(
      post.telegramMessageSnapshot.text,
      post.telegramMessageSnapshot.entities,
      segment.text,
    );
  }
  return [];
}

function splitPostToMessages(post: any): PostMessage[] {
  if (!post) return [];
  const segments = splitContentMessagesWithOffsets(post.content || '');
  if (segments.length === 0) return [];
  return segments.map((seg, i) => {
    const entities = resolveEntitiesForMessage(post, seg);
    const rawButtons = extractButtonsForMessage(post.buttons, i);
    const buttons = rawButtons.length > 0 ? JSON.parse(JSON.stringify(rawButtons)) : [];
    const media = i === 0 && Array.isArray(post.media) && post.media.length > 0
      ? JSON.parse(JSON.stringify(post.media))
      : undefined;
    const snapshot = msgSnapshotResolver(post.telegramMessageSnapshot, seg.text);
    return { index: i, content: seg.text, entities, buttons, media, snapshot };
  });
}

function msgSnapshotResolver(snapshot: any, segmentText: string): any {
  if (!snapshot) return undefined;
  const scopedEntities = snapshot.text
    ? extractSnapshotEntitiesForSegment(snapshot.text, snapshot.entities, segmentText)
    : [];
  return {
    text: segmentText,
    entities: scopedEntities,
    caption: snapshot.caption,
    caption_entities: snapshot.caption_entities,
  };
}

function buildMessageContext(post: any, messageIndex: number): MessageRenderContext {
  const messages = splitPostToMessages(post);
  const message = messages[messageIndex];
  if (!message) throw new Error(`Message index ${messageIndex} not found`);
  return { message, postId: post.id };
}

// ─── Replicate MessageRenderContext isolation functions ────────────

type ContentSegment = { text: string; offset: number };

function splitContentMessagesWithOffsets(content: string): ContentSegment[] {
  if (!content || !content.trim()) return [];
  const segments: ContentSegment[] = [];
  const regex = /\[\[copy\]\](.*?)\[\[\/copy\]\]/gs;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const raw = content.slice(lastIndex, match.index);
      const trimmed = raw.trim();
      if (trimmed) {
        const leadingWs = raw.length - raw.trimStart().length;
        segments.push({ text: trimmed, offset: lastIndex + leadingWs });
      }
    }
    const innerRaw = match[1];
    const trimmed = innerRaw.trim();
    if (trimmed) {
      const innerOffset = match.index + match[0].indexOf(match[1]);
      const leadingWs = innerRaw.length - innerRaw.trimStart().length;
      segments.push({ text: trimmed, offset: innerOffset + leadingWs });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    const raw = content.slice(lastIndex);
    const trimmed = raw.trim();
    if (trimmed) {
      const leadingWs = raw.length - raw.trimStart().length;
      segments.push({ text: trimmed, offset: lastIndex + leadingWs });
    }
  }
  if (segments.length === 0 && content.trim()) {
    const trimmed = content.trim();
    const leadingWs = content.length - content.trimStart().length;
    segments.push({ text: trimmed, offset: leadingWs });
  }
  return segments;
}

function extractContentEntitiesForSegment(
  entities: any[] | null | undefined,
  segmentOffset: number,
  segmentLength: number,
): any[] {
  if (!Array.isArray(entities) || entities.length === 0) return [];
  const adjusted: any[] = [];
  for (const e of entities) {
    if (e.offset >= segmentOffset && e.offset + e.length <= segmentOffset + segmentLength) {
      adjusted.push({ ...e, offset: e.offset - segmentOffset });
    }
  }
  return adjusted;
}

function extractSnapshotEntitiesForSegment(
  snapshotText: string | undefined,
  snapshotEntities: any[] | null | undefined,
  segmentText: string,
): any[] {
  if (!snapshotText || !Array.isArray(snapshotEntities) || snapshotEntities.length === 0) return [];
  const pos = snapshotText.indexOf(segmentText);
  if (pos < 0) return [];
  const end = pos + segmentText.length;
  const adjusted: any[] = [];
  for (const e of snapshotEntities) {
    if (e.offset >= pos && e.offset + e.length <= end) {
      adjusted.push({ ...e, offset: e.offset - pos });
    }
  }
  return adjusted;
}

function extractButtonsForMessage(raw: any, messageIndex: number): any[][] {
  if (!raw) return [];
  if (typeof raw === 'object' && !Array.isArray(raw) && raw.messages) {
    return Array.isArray(raw.messages[String(messageIndex)]) ? raw.messages[String(messageIndex)] : [];
  }
  if (Array.isArray(raw)) return messageIndex === 0 ? raw : [];
  return [];
}

// ══════════════════════════════════════════════════════════════════
// NEW DATA MODEL: splitPostToMessages
// ══════════════════════════════════════════════════════════════════

describe('splitPostToMessages', () => {
  it('returns empty array for null/undefined post', () => {
    expect(splitPostToMessages(null)).toEqual([]);
    expect(splitPostToMessages(undefined)).toEqual([]);
  });

  it('returns empty array for post with empty content', () => {
    expect(splitPostToMessages({ content: '' })).toEqual([]);
    expect(splitPostToMessages({ content: '   ' })).toEqual([]);
  });

  it('single message returns one PostMessage with correct fields', () => {
    const result = splitPostToMessages({
      id: 1,
      content: 'Hello World',
    });
    expect(result).toHaveLength(1);
    expect(result[0].index).toBe(0);
    expect(result[0].content).toBe('Hello World');
    expect(result[0].entities).toEqual([]);
    expect(result[0].buttons).toEqual([]);
    expect(result[0].media).toBeUndefined();
    expect(result[0].snapshot).toBeUndefined();
  });

  it('multiple messages return correct PostMessage[]', () => {
    const post = {
      id: 1,
      content: 'First[[copy]]Second[[/copy]]',
    };
    const result = splitPostToMessages(post);
    expect(result).toHaveLength(2);
    expect(result[0].index).toBe(0);
    expect(result[0].content).toBe('First');
    expect(result[1].index).toBe(1);
    expect(result[1].content).toBe('Second');
  });

  it('indexes are sequential starting from 0', () => {
    const post = {
      content: 'A[[copy]]B[[/copy]][[copy]]C[[/copy]]',
    };
    const result = splitPostToMessages(post);
    expect(result).toHaveLength(3);
    expect(result.map(m => m.index)).toEqual([0, 1, 2]);
  });

  it('entities are per-message and offset-adjusted', () => {
    const post = {
      content: 'Hello[[copy]]World[[/copy]]',
      entities: [
        { offset: 0, length: 2, type: 'bold' },    // "He" in msg 0
        { offset: 13, length: 3, type: 'italic' },  // "Wor" in msg 1
      ],
    };
    const result = splitPostToMessages(post);
    expect(result[0].entities).toHaveLength(1);
    expect(result[0].entities[0].type).toBe('bold');
    expect(result[0].entities[0].offset).toBe(0);
    expect(result[0].entities[0].length).toBe(2);
    expect(result[1].entities).toHaveLength(1);
    expect(result[1].entities[0].type).toBe('italic');
    expect(result[1].entities[0].offset).toBe(0);
    expect(result[1].entities[0].length).toBe(3);
  });

  it('buttons are per-message from messages format', () => {
    const post = {
      content: 'A[[copy]]B[[/copy]]',
      buttons: {
        messages: {
          '0': [[{ text: 'Btn0' }]],
          '1': [[{ text: 'Btn1' }]],
        },
      },
    };
    const result = splitPostToMessages(post);
    expect(result[0].buttons).toHaveLength(1);
    expect(result[0].buttons[0][0].text).toBe('Btn0');
    expect(result[1].buttons).toHaveLength(1);
    expect(result[1].buttons[0][0].text).toBe('Btn1');
  });

  it('only msg 0 gets media', () => {
    const post = {
      content: 'A[[copy]]B[[/copy]]',
      media: [{ type: 'photo', fileId: 'x' }],
    };
    const result = splitPostToMessages(post);
    expect(result[0].media).toBeDefined();
    expect(result[0].media).toHaveLength(1);
    expect(result[1].media).toBeUndefined();
  });

  it('no shared entity reference between messages', () => {
    const post = {
      content: 'A[[copy]]B[[/copy]]',
      entities: [
        { offset: 0, length: 1, type: 'bold' },
        { offset: 6, length: 1, type: 'italic' },
      ],
    };
    const result = splitPostToMessages(post);
    expect(result[0].entities).not.toBe(result[1].entities);
  });

  it('no shared button reference between messages', () => {
    const post = {
      content: 'A[[copy]]B[[/copy]]',
      buttons: {
        messages: {
          '0': [[{ text: 'A' }]],
          '1': [[{ text: 'B' }]],
        },
      },
    };
    const result = splitPostToMessages(post);
    expect(result[0].buttons).not.toBe(result[1].buttons);
  });

  it('mutating msg 0 entities does not affect msg 1', () => {
    const post = {
      content: 'A[[copy]]B[[/copy]]',
      entities: [
        { offset: 0, length: 1, type: 'bold' },
        { offset: 6, length: 1, type: 'italic' },
      ],
    };
    const result = splitPostToMessages(post);
    const originalLen1 = result[1].entities.length;
    result[0].entities.push({ offset: 1, length: 1, type: 'code' });
    expect(result[0].entities).toHaveLength(2);
    expect(result[1].entities).toHaveLength(originalLen1);
  });

  it('mutating msg 0 buttons does not affect msg 1', () => {
    const post = {
      content: 'A[[copy]]B[[/copy]]',
      buttons: {
        messages: {
          '0': [[{ text: 'A' }]],
          '1': [[{ text: 'B' }]],
        },
      },
    };
    const result = splitPostToMessages(post);
    result[0].buttons[0][0].text = 'Mutated';
    expect(result[1].buttons[0][0].text).toBe('B');
  });

  it('mutating msg 0 media does not affect post.media', () => {
    const post = {
      content: 'A[[copy]]B[[/copy]]',
      media: [{ type: 'photo', fileId: 'x' }],
    };
    const result = splitPostToMessages(post);
    (result[0].media as any[]).push({ type: 'video', fileId: 'y' });
    expect(result[0].media).toHaveLength(2);
    expect(post.media).toHaveLength(1);
  });

  it('snapshot is scoped per message with correct text and entities', () => {
    const post = {
      content: 'Hello[[copy]]World[[/copy]]',
      telegramMessageSnapshot: {
        text: 'HelloWorld',
        entities: [
          { offset: 0, length: 5, type: 'bold' },
          { offset: 5, length: 5, type: 'italic' },
        ],
      },
    };
    const result = splitPostToMessages(post);
    expect(result[0].snapshot).toBeDefined();
    expect(result[0].snapshot.text).toBe('Hello');
    expect(result[0].snapshot.entities).toHaveLength(1);
    expect(result[0].snapshot.entities[0].type).toBe('bold');
    expect(result[0].snapshot.entities[0].offset).toBe(0);
    expect(result[1].snapshot).toBeDefined();
    expect(result[1].snapshot.text).toBe('World');
    expect(result[1].snapshot.entities).toHaveLength(1);
    expect(result[1].snapshot.entities[0].type).toBe('italic');
    expect(result[1].snapshot.entities[0].offset).toBe(0);
  });

  it('snapshot fallback: post-level entities used when no snapshot present', () => {
    const post = {
      content: 'Hello[[copy]]World[[/copy]]',
      entities: [
        { offset: 0, length: 5, type: 'bold' },   // "Hello" in msg 0
        { offset: 13, length: 5, type: 'italic' }, // "World" in msg 1
      ],
      telegramMessageSnapshot: undefined,
    };
    const result = splitPostToMessages(post);
    expect(result[0].entities).toHaveLength(1);
    expect(result[0].entities[0].type).toBe('bold');
    expect(result[1].entities).toHaveLength(1);
    expect(result[1].entities[0].type).toBe('italic');
  });
});

// ══════════════════════════════════════════════════════════════════
// NEW DATA MODEL: buildMessageContext
// ══════════════════════════════════════════════════════════════════

describe('buildMessageContext', () => {
  const post = {
    id: 42,
    content: 'First[[copy]]Second[[/copy]]',
    entities: [
      { offset: 0, length: 5, type: 'bold' },    // "First" in msg 0
      { offset: 13, length: 6, type: 'italic' },  // "Second" in msg 1
    ],
    buttons: {
      messages: {
        '0': [[{ text: 'A' }]],
        '1': [[{ text: 'B' }]],
      },
    },
  };

  it('returns context with correct postId', () => {
    const ctx = buildMessageContext(post, 0);
    expect(ctx.postId).toBe(42);
  });

  it('returns context wrapping correct PostMessage for index 0', () => {
    const ctx = buildMessageContext(post, 0);
    expect(ctx.message.index).toBe(0);
    expect(ctx.message.content).toBe('First');
    expect(ctx.message.entities).toHaveLength(1);
    expect(ctx.message.entities[0].type).toBe('bold');
    expect(ctx.message.buttons).toHaveLength(1);
  });

  it('returns context wrapping correct PostMessage for index 1', () => {
    const ctx = buildMessageContext(post, 1);
    expect(ctx.message.index).toBe(1);
    expect(ctx.message.content).toBe('Second');
    expect(ctx.message.entities).toHaveLength(1);
    expect(ctx.message.entities[0].type).toBe('italic');
    expect(ctx.message.buttons).toHaveLength(1);
  });

  it('throws for out-of-range index', () => {
    expect(() => buildMessageContext(post, 99)).toThrow();
  });

  it('contexts for different indices have different PostMessage references', () => {
    const ctx0 = buildMessageContext(post, 0);
    const ctx1 = buildMessageContext(post, 1);
    expect(ctx0.message).not.toBe(ctx1.message);
  });
});

// ══════════════════════════════════════════════════════════════════
// renderMessage pure function (replicated from telegram-native-renderer.service.ts)
// ══════════════════════════════════════════════════════════════════

function telegramLength(text: string) {
  return Buffer.from(text || '', 'utf16le').length / 2;
}

function renderMessagePure(
  content: string,
  entities: any[],
  buttons: any[][],
  media: any[] | undefined,
): any {
  const text = content || '';
  const textEntities = entities?.length ? JSON.parse(JSON.stringify(entities)) : undefined;
  const btnKeyboard = buttons?.length ? JSON.parse(JSON.stringify(buttons)) : [];
  const markup = btnKeyboard.length ? { inline_keyboard: btnKeyboard } : undefined;
  const mediaList = media?.length ? JSON.parse(JSON.stringify(media)) : [];

  if (mediaList.length > 1) {
    return {
      method: 'sendMediaGroup',
      media: mediaList.map((m: any, i: number) => ({
        type: m.type,
        media: m.fileId,
        caption: i === 0 ? (m.caption || text || undefined) : undefined,
        caption_entities: i === 0 ? textEntities : undefined,
      })),
    };
  }

  if (mediaList.length === 1) {
    const m = mediaList[0];
    if (m.type === 'sticker') {
      return { method: 'sendSticker', sticker: m.fileId, reply_markup: markup };
    }
    return {
      method: 'sendPhoto',
      media: m.fileId,
      caption: m.caption || text || undefined,
      caption_entities: textEntities,
      reply_markup: markup,
    };
  }

  return {
    method: 'sendMessage',
    text: text || '(پست خالی)',
    entities: textEntities,
    reply_markup: markup,
  };
}

describe('renderMessage (pure function)', () => {
  it('returns sendMessage payload for text-only message', () => {
    const payload = renderMessagePure('Hello World', [{ offset: 0, length: 5, type: 'bold' }], [], undefined);
    expect(payload.method).toBe('sendMessage');
    expect(payload.text).toBe('Hello World');
    expect(payload.entities).toBeDefined();
    expect(payload.entities).toHaveLength(1);
    expect(payload.entities[0].type).toBe('bold');
  });

  it('returns sendMessage with empty text fallback', () => {
    const payload = renderMessagePure('', [], [], undefined);
    expect(payload.method).toBe('sendMessage');
    expect(payload.text).toBe('(پست خالی)');
    expect(payload.entities).toBeUndefined();
  });

  it('returns sendSticker payload for single sticker media', () => {
    const payload = renderMessagePure('Caption', [], [], [{ type: 'sticker', fileId: 'sticker123' }]);
    expect(payload.method).toBe('sendSticker');
    expect(payload.sticker).toBe('sticker123');
    expect(payload.reply_markup).toBeUndefined();
  });

  it('returns sendPhoto payload for single photo media', () => {
    const payload = renderMessagePure('Photo caption', [], [], [{ type: 'photo', fileId: 'photo123', caption: 'Photo caption' }]);
    expect(payload.method).toBe('sendPhoto');
    expect(payload.media).toBe('photo123');
    expect(payload.caption).toBe('Photo caption');
  });

  it('returns sendMediaGroup payload for multiple media', () => {
    const payload = renderMessagePure('Group text', [], [], [
      { type: 'photo', fileId: 'p1' },
      { type: 'video', fileId: 'v1' },
    ]);
    expect(payload.method).toBe('sendMediaGroup');
    expect(payload.media).toHaveLength(2);
    expect(payload.media[0].media).toBe('p1');
    expect(payload.media[0].caption).toBe('Group text');
    expect(payload.media[1].caption).toBeUndefined();
  });

  it('includes reply_markup when buttons present', () => {
    const payload = renderMessagePure('Text', [], [[{ text: 'Btn', url: 'https://x.com' }]], undefined);
    expect(payload.reply_markup).toBeDefined();
    expect(payload.reply_markup.inline_keyboard).toHaveLength(1);
  });

  it('deep clones entities (mutation after call does not affect result)', () => {
    const entities = [{ offset: 0, length: 4, type: 'bold' }];
    const payload = renderMessagePure('Hello', entities, [], undefined);
    entities[0].type = 'italic';
    expect(payload.entities[0].type).toBe('bold');
  });

  it('deep clones buttons (mutation after call does not affect result)', () => {
    const buttons: any[][] = [[{ text: 'Original', url: 'https://x.com' }]];
    const payload = renderMessagePure('Text', [], buttons, undefined);
    buttons[0][0].text = 'Mutated';
    expect(payload.reply_markup.inline_keyboard[0][0].text).toBe('Original');
  });

  it('deep clones media (mutation after call does not affect result)', () => {
    const media = [{ type: 'photo', fileId: 'originalId' }];
    const payload = renderMessagePure('Text', [], [], media);
    media[0].fileId = 'mutatedId';
    expect(payload.media).toBe('originalId');
  });

  it('returns different payload objects for sequential calls', () => {
    const p1 = renderMessagePure('Msg1', [{ offset: 0, length: 2, type: 'bold' }], [], undefined);
    const p2 = renderMessagePure('Msg2', [{ offset: 0, length: 2, type: 'italic' }], [], undefined);
    expect(p1).not.toBe(p2);
    expect(p1.entities[0].type).toBe('bold');
    expect(p2.entities[0].type).toBe('italic');
  });
});

// ─── ensureNoSharedRefs runtime guard ─────────────────────────────

function ensureNoSharedRefs(ctx: any): void {
  if (ctx.__sharedReference === true) {
    throw new Error('[RENDER] RENDER PIPELINE LEAK DETECTED — shared reference flag is set');
  }
  if (ctx.message && ctx.message.__sharedReference === true) {
    throw new Error('[RENDER] RENDER PIPELINE LEAK DETECTED — message has shared reference flag');
  }
}

describe('ensureNoSharedRefs runtime guard', () => {
  it('passes silently for clean context', () => {
    expect(() => ensureNoSharedRefs({})).not.toThrow();
  });

  it('passes silently for normal PostMessage', () => {
    expect(() => ensureNoSharedRefs({ message: { index: 0, content: 'Hello', entities: [], buttons: [], media: undefined, snapshot: undefined }, postId: 1 })).not.toThrow();
  });

  it('throws for context with __sharedReference set to true', () => {
    expect(() => ensureNoSharedRefs({ __sharedReference: true })).toThrow('RENDER PIPELINE LEAK DETECTED');
  });

  it('throws for message with __sharedReference set to true', () => {
    expect(() => ensureNoSharedRefs({ message: { __sharedReference: true, content: 'Leak' } })).toThrow('RENDER PIPELINE LEAK DETECTED');
  });

  it('does not throw for __sharedReference set to false', () => {
    expect(() => ensureNoSharedRefs({ __sharedReference: false })).not.toThrow();
  });
});

// ══════════════════════════════════════════════════════════════════
// MESSAGE CONTEXT ISOLATION TESTS (using splitPostToMessages)
// ══════════════════════════════════════════════════════════════════

describe('MessageRenderContext Isolation', () => {
  const multiMsgPost = {
    id: 1,
    content: 'First msg[[copy]]Second msg[[/copy]]',
    entities: [
      { offset: 0, length: 4, type: 'bold' },
      { offset: 17, length: 6, type: 'italic' },
    ],
    buttons: {
      messages: {
        '0': [[{ text: 'Btn0', type: 'URL', value: 'https://a.com' }]],
        '1': [[{ text: 'Btn1', type: 'URL', value: 'https://b.com' }]],
      },
    },
    media: [{ type: 'photo', fileId: 'photoid' }],
  };

  const messages = splitPostToMessages(multiMsgPost);
  const ctx0 = { message: messages[0], postId: 1 };
  const ctx1 = { message: messages[1], postId: 1 };

  it('splits 2 messages with correct segments', () => {
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe('First msg');
    expect(messages[1].content).toBe('Second msg');
  });

  it('message 0 has its own entities', () => {
    expect(ctx0.message.entities).toHaveLength(1);
    expect(ctx0.message.entities[0].type).toBe('bold');
    expect(ctx0.message.entities[0].offset).toBe(0);
    expect(ctx0.message.entities[0].length).toBe(4);
  });

  it('message 1 has its own entities (different from msg 0)', () => {
    expect(ctx1.message.entities).toHaveLength(1);
    expect(ctx1.message.entities[0].type).toBe('italic');
    expect(ctx1.message.entities[0].offset).toBe(0);
    expect(ctx1.message.entities[0].length).toBe(6);
  });

  it('message 0 and message 1 have different entity arrays (no shared reference)', () => {
    expect(ctx0.message.entities).not.toBe(ctx1.message.entities);
    expect(ctx0.message.entities[0].type).not.toBe(ctx1.message.entities[0].type);
  });

  it('mutating message 0 entities does NOT affect message 1 entities', () => {
    const entities0 = ctx0.message.entities;
    const originalLen1 = ctx1.message.entities.length;
    const originalType1 = ctx1.message.entities[0].type;
    entities0.push({ offset: 5, length: 3, type: 'code' });
    expect(ctx0.message.entities).toHaveLength(2);
    expect(ctx1.message.entities).toHaveLength(originalLen1);
    expect(ctx1.message.entities[0].type).toBe(originalType1);
  });

  it('mutating message 1 entities does NOT affect message 0 entities', () => {
    const entities1 = ctx1.message.entities;
    const originalLen0 = ctx0.message.entities.length;
    entities1.splice(0, 1);
    expect(ctx1.message.entities).toHaveLength(0);
    expect(ctx0.message.entities).toHaveLength(originalLen0);
  });

  it('message 0 gets media, message 1 does not', () => {
    expect(ctx0.message.media).toBeDefined();
    expect(ctx0.message.media).toHaveLength(1);
    expect(ctx1.message.media).toBeUndefined();
  });

  it('mutating message 0 media does NOT affect post.media', () => {
    const originalMediaLen = (multiMsgPost.media as any[]).length;
    (ctx0.message.media as any[]).push({ type: 'video', fileId: 'other' });
    expect(ctx0.message.media).toHaveLength(originalMediaLen + 1);
    expect(multiMsgPost.media).toHaveLength(originalMediaLen);
  });

  it('message 0 has its own buttons', () => {
    expect(ctx0.message.buttons).toHaveLength(1);
    expect(ctx0.message.buttons[0][0].text).toBe('Btn0');
  });

  it('message 1 has its own buttons', () => {
    expect(ctx1.message.buttons).toHaveLength(1);
    expect(ctx1.message.buttons[0][0].text).toBe('Btn1');
  });

  it('message 0 and message 1 have different button arrays (no shared reference)', () => {
    expect(ctx0.message.buttons).not.toBe(ctx1.message.buttons);
  });

  it('array-format buttons: message 0 gets buttons, message 1 gets empty', () => {
    const arrPost = {
      content: 'A[[copy]]B[[/copy]]',
      entities: [],
      buttons: [[{ text: 'OnlyBtn', type: 'URL', value: 'https://x.com' }]],
    };
    const arrMsgs = splitPostToMessages(arrPost);
    expect(arrMsgs[0].buttons).toHaveLength(1);
    expect(arrMsgs[1].buttons).toHaveLength(0);
  });

  it('extractButtonsForMessage: messages format returns per-message', () => {
    const raw = { messages: { '0': [[{ text: 'A' }]], '1': [[{ text: 'B' }]] } };
    expect(extractButtonsForMessage(raw, 0)).toEqual([[{ text: 'A' }]]);
    expect(extractButtonsForMessage(raw, 1)).toEqual([[{ text: 'B' }]]);
  });

  it('extractButtonsForMessage: array format returns for msg0 only', () => {
    const raw = [[{ text: 'A' }], [{ text: 'B' }]];
    expect(extractButtonsForMessage(raw, 0)).toEqual([[{ text: 'A' }], [{ text: 'B' }]]);
    expect(extractButtonsForMessage(raw, 1)).toEqual([]);
  });

  it('extractContentEntitiesForSegment: filters by offset range', () => {
    const ents = [
      { offset: 0, length: 3, type: 'bold' },
      { offset: 10, length: 4, type: 'italic' },
      { offset: 20, length: 5, type: 'code' },
    ];
    const result = extractContentEntitiesForSegment(ents, 10, 4);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('italic');
    expect(result[0].offset).toBe(0);
  });

  it('extractSnapshotEntitiesForSegment: finds segment text and adjusts offsets', () => {
    const snapText = 'Hello World Foo';
    const snapEnts = [
      { offset: 0, length: 5, type: 'bold' },
      { offset: 6, length: 5, type: 'italic' },
    ];
    const result = extractSnapshotEntitiesForSegment(snapText, snapEnts, 'World');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('italic');
    expect(result[0].offset).toBe(0);
  });

  it('supports bold, italic, code, blockquote, link, custom_emoji per message', () => {
    const ents = [
      { offset: 0, length: 4, type: 'bold' },
      { offset: 5, length: 6, type: 'italic' },
      { offset: 12, length: 4, type: 'code' },
      { offset: 17, length: 9, type: 'blockquote' },
    ];
    const allSegment: ContentSegment = { text: 'Bold Italic Code Blockquote', offset: 0 };
    const result = extractContentEntitiesForSegment(ents, allSegment.offset, allSegment.text.length);
    expect(result).toHaveLength(4);
    expect(result.map((e: any) => e.type)).toEqual(['bold', 'italic', 'code', 'blockquote']);
  });

  it('nested entities: bold inside italic inside blockquote — all scoped per message', () => {
    const ents = [
      { offset: 0, length: 10, type: 'blockquote' },
      { offset: 1, length: 8, type: 'italic' },
      { offset: 2, length: 6, type: 'bold' },
    ];
    const seg: ContentSegment = { text: 'NESTED TXT', offset: 0 };
    const result = extractContentEntitiesForSegment(ents, seg.offset, seg.text.length);
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe('blockquote');
    expect(result[1].type).toBe('italic');
    expect(result[2].type).toBe('bold');
  });
});
