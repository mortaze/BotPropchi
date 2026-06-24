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
  const formatted = ensureMessagesFormat(raw);
  if (formatted && formatted.messages) {
    return formatted.messages[String(messageIdx)] || formatted.messages['_shared'] || [];
  }
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

function hasMultiMessageContent(content: string | null | undefined): boolean {
  if (!content) return false;
  return /\[\[copy\]\]/.test(content);
}

function extractButtons(post: any): any {
  const content = post.content || post.contentText || '';
  const isMulti = hasMultiMessageContent(content);

  let raw: any = undefined;

  if (post.buttons !== undefined) {
    raw = post.buttons;
  } else if (post.keyboards && Array.isArray(post.keyboards) && post.keyboards.length > 0) {
    const rows: any[][] = [];
    for (const kb of post.keyboards) {
      if (!rows[kb.row]) rows[kb.row] = [];
      rows[kb.row][kb.col] = { text: kb.text, type: kb.type || 'URL', value: kb.value || '' };
    }
    raw = rows;
  } else if (post.telegramPayload?.keyboard && Array.isArray(post.telegramPayload.keyboard)) {
    raw = JSON.parse(JSON.stringify(post.telegramPayload.keyboard));
  } else if (post.telegramMessageSnapshot?.reply_markup?.inline_keyboard) {
    raw = JSON.parse(JSON.stringify(post.telegramMessageSnapshot.reply_markup.inline_keyboard));
  }

  if (!raw) return [];

  if (raw && typeof raw === 'object' && !Array.isArray(raw) && raw.messages) {
    return JSON.parse(JSON.stringify(raw));
  }

  if (Array.isArray(raw) && isMulti) {
    return { messages: { '0': JSON.parse(JSON.stringify(raw)) } };
  }

  return JSON.parse(JSON.stringify(raw));
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

// ─── Replicate normalizeButtons from telegram-native-renderer.service.ts ──

function normalizeButtons(raw: any): any[][] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object' && !Array.isArray(raw) && raw.messages) {
    return raw.messages['0'] || raw.messages['_shared'] || [];
  }
  return [];
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

  it('falls back to _shared for missing message index', () => {
    expect(getMessageButtons(msgFormat, 99)).toEqual([[{ text: 'Shared', type: 'URL' }]]);
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

describe('hasMultiMessageContent', () => {
  it('detects [[copy]] markers', () => {
    expect(hasMultiMessageContent('Hello[[copy]]World[[/copy]]')).toBe(true);
  });

  it('returns false for single message content', () => {
    expect(hasMultiMessageContent('Hello World')).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(hasMultiMessageContent(null)).toBe(false);
    expect(hasMultiMessageContent(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(hasMultiMessageContent('')).toBe(false);
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

  it('converts array format to messages format for multi-message post', () => {
    const post = {
      content: 'Msg1[[copy]]Msg2[[/copy]]',
      buttons: [[{ text: 'Btn', type: 'URL', value: 'https://example.com' }]],
    };
    const result = extractButtons(post);
    expect(result).toEqual({ messages: { '0': post.buttons } });
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

  it('converts keyboards to messages format for multi-message', () => {
    const post = {
      content: 'Msg1[[copy]]Msg2[[/copy]]',
      keyboards: [
        { row: 0, col: 0, text: 'Btn1', type: 'URL', value: 'https://ex.com' },
      ],
    };
    const result = extractButtons(post);
    expect(result).toEqual({
      messages: { '0': [[{ text: 'Btn1', type: 'URL', value: 'https://ex.com' }]] },
    });
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

describe('normalizeButtons (renderer)', () => {
  it('extracts message 0 buttons from messages format', () => {
    const input = { messages: { '0': [[{ text: 'A' }]], '1': [[{ text: 'B' }]] } };
    expect(normalizeButtons(input)).toEqual([[{ text: 'A' }]]);
  });

  it('falls back to _shared if message 0 not present', () => {
    const input = { messages: { '1': [[{ text: 'B' }]], '_shared': [[{ text: 'S' }]] } };
    expect(normalizeButtons(input)).toEqual([[{ text: 'S' }]]);
  });

  it('passes through array format', () => {
    expect(normalizeButtons([[{ text: 'A' }]])).toEqual([[{ text: 'A' }]]);
  });

  it('returns empty for null/undefined', () => {
    expect(normalizeButtons(null)).toEqual([]);
    expect(normalizeButtons(undefined)).toEqual([]);
  });

  it('returns empty for empty messages', () => {
    expect(normalizeButtons({ messages: {} })).toEqual([]);
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

  it('normalizer converts array buttons to messages format for multi-message', () => {
    const post = {
      content: 'Msg1[[copy]]Msg2[[/copy]]',
      buttons: [[{ text: 'SharedBtn', type: 'URL', value: 'https://ex.com' }]],
    };
    const result = extractButtons(post);
    expect(result.messages).toBeDefined();
    expect(result.messages['0']).toEqual(post.buttons);
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
