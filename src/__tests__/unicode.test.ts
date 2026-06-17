import { describe, it, expect } from 'vitest';
import {
  normalizeUnicode,
  sanitizeUnicode,
  validateUnicode,
  sanitizeTelegramText,
  validateTelegramButton,
  sanitizeTelegramExtra,
  sanitizeJsonStrings,
  validateDbInput,
  sanitizeTextArray,
  ensureTelegramSafe,
  buildSafeTelegramButton,
  validateButtonPayload,
  TELEGRAM_BUTTON_TEXT_MAX,
  TELEGRAM_CALLBACK_DATA_MAX,
} from '../utils/unicode';
import { graphemeCount } from '../utils/grapheme';

describe('normalizeUnicode', () => {
  it('returns empty string for empty input', () => {
    expect(normalizeUnicode('')).toBe('');
    expect(normalizeUnicode(null as any)).toBe(null);
    expect(normalizeUnicode(undefined as any)).toBe(undefined);
  });

  it('normalizes composed characters to NFC', () => {
    const composed = '\u00E9'; // é precomposed
    const decomposed = '\u0065\u0301'; // e + combining acute
    expect(normalizeUnicode(decomposed)).toBe(composed);
  });

  it('preserves already-normalized text', () => {
    const text = 'Hello World';
    expect(normalizeUnicode(text)).toBe(text);
  });

  it('normalizes Persian text', () => {
    const text = 'سلام دنیا';
    expect(normalizeUnicode(text)).toBe(text);
  });

  it('normalizes mixed RTL/LTR', () => {
    const text = 'Hello سلام 123';
    expect(normalizeUnicode(text)).toBe(text);
  });
});

describe('sanitizeUnicode', () => {
  it('removes lone surrogate characters', () => {
    const loneSurrogate = '\uD800';
    expect(sanitizeUnicode(loneSurrogate)).toBe('');
  });

  it('removes multiple lone surrogates', () => {
    const text = 'abc\uD800def\uDFFFghi';
    expect(sanitizeUnicode(text)).toBe('abcdefghi');
  });

  it('preserves valid surrogate pairs (astral codepoints)', () => {
    const emoji = '😀'; // U+1F600, surrogate pair in UTF-16
    expect(sanitizeUnicode(emoji)).toBe(emoji);
  });

  it('preserves emoji sequences with ZWJ', () => {
    const zwjEmoji = '👨‍👩‍👧‍👦'; // family emoji ZWJ sequence
    const result = sanitizeUnicode(zwjEmoji);
    expect(result).toBe(zwjEmoji);
  });

  it('preserves emoji with skin tone modifier', () => {
    const withTone = '👍🏻'; // thumbs up + light skin tone
    expect(sanitizeUnicode(withTone)).toBe(withTone);
  });

  it('preserves country flag emojis', () => {
    const flag = '🇮🇷'; // Iran flag (regional indicators)
    expect(sanitizeUnicode(flag)).toBe(flag);
  });

  it('removes control characters', () => {
    const withCtrl = 'hello\x00world\x1Ftest';
    expect(sanitizeUnicode(withCtrl)).toBe('helloworldtest');
  });

  it('preserves newlines and tabs', () => {
    const text = 'line1\nline2\tindented';
    expect(sanitizeUnicode(text)).toBe(text);
  });

  it('strips invalid control chars but keeps formatting whitespace', () => {
    const text = 'a\x00b\x08c\nd';
    const result = sanitizeUnicode(text);
    expect(result).toContain('a');
    expect(result).toContain('b');
    expect(result).toContain('c');
    expect(result).toContain('\n');
    expect(result).toContain('d');
    expect(result).not.toContain('\x00');
    expect(result).not.toContain('\x08');
  });
});

describe('validateUnicode', () => {
  it('returns valid for clean text', () => {
    const result = validateUnicode('Hello World');
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('detects lone surrogates', () => {
    const result = validateUnicode('\uD800');
    expect(result.valid).toBe(false);
    expect(result.issues[0].description).toContain('Lone surrogate');
  });

  it('detects control characters', () => {
    const result = validateUnicode('\x00null\x1F');
    expect(result.valid).toBe(false);
  });

  it('validates Persian text as clean', () => {
    expect(validateUnicode('سلام دنیا').valid).toBe(true);
  });

  it('validates emoji chains', () => {
    const emojis = '😀🎉🚀💯🔥🌟⭐';
    expect(validateUnicode(emojis).valid).toBe(true);
  });

  it('reports multiple issues', () => {
    const result = validateUnicode('\uD800abc\uDFFF');
    expect(result.issues.length).toBe(2);
  });

  it('is valid for empty string', () => {
    expect(validateUnicode('').valid).toBe(true);
  });
});

describe('sanitizeTelegramText', () => {
  it('normalizes and sanitizes', () => {
    const corrupted = '\uD800Hello\uDFFFWorld';
    const result = sanitizeTelegramText(corrupted);
    expect(result).toBe('HelloWorld');
  });

  it('truncates to max length', () => {
    const text = 'a'.repeat(100);
    const result = sanitizeTelegramText(text, 50);
    expect(result).toHaveLength(50);
  });

  it('does not truncate if under limit', () => {
    const text = 'Hello World';
    expect(sanitizeTelegramText(text, 100)).toBe(text);
  });

  it('handles null/undefined', () => {
    expect(sanitizeTelegramText(null as any)).toBe(null);
    expect(sanitizeTelegramText(undefined as any)).toBe(undefined);
  });

  it('handles Persian with emoji', () => {
    const text = 'سلام 😀 دنیا';
    const result = sanitizeTelegramText(text);
    expect(result).toBe(text);
  });

  it('handles long Persian text with line breaks', () => {
    const text = 'سلام\nدنیا\nچطور\nهستید؟';
    expect(sanitizeTelegramText(text)).toBe(text);
  });
});

describe('validateTelegramButton', () => {
  it('returns valid for clean text', () => {
    const result = validateTelegramButton('Hello');
    expect(result.valid).toBe(true);
  });

  it('sanitizes corrupted text', () => {
    const result = validateTelegramButton('Hello\uD800World');
    expect(result.valid).toBe(false);
    expect(result.sanitized).toBe('HelloWorld');
  });

  it('truncates long text to TELEGRAM_BUTTON_TEXT_MAX', () => {
    const long = 'a'.repeat(TELEGRAM_BUTTON_TEXT_MAX + 100);
    const result = validateTelegramButton(long);
    expect(result.sanitized.length).toBeLessThanOrEqual(TELEGRAM_BUTTON_TEXT_MAX);
  });
});

describe('sanitizeTelegramExtra', () => {
  it('sanitizes caption', () => {
    const extra = { caption: 'Hello\uD800World' };
    const result = sanitizeTelegramExtra(extra);
    expect(result.caption).toBe('HelloWorld');
  });

  it('sanitizes inline keyboard button text', () => {
    const extra = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Click\uD800Me', callback_data: 'data1' },
          ],
        ],
      },
    };
    const result = sanitizeTelegramExtra(extra);
    expect(result.reply_markup.inline_keyboard[0][0].text).toBe('ClickMe');
  });

  it('sanitizes inline keyboard callback_data', () => {
    const extra = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Click', callback_data: 'bad\uD800data' },
          ],
        ],
      },
    };
    const result = sanitizeTelegramExtra(extra);
    expect(result.reply_markup.inline_keyboard[0][0].callback_data).toBe('baddata');
  });

  it('sanitizes reply keyboard button text', () => {
    const extra = {
      reply_markup: {
        keyboard: [
          ['Button\uD8001', 'Button2'],
        ],
      },
    };
    const result = sanitizeTelegramExtra(extra);
    expect(result.reply_markup.keyboard[0][0]).toBe('Button1');
  });

  it('handles null/undefined', () => {
    expect(sanitizeTelegramExtra(null)).toBe(null);
    expect(sanitizeTelegramExtra(undefined)).toBe(undefined);
  });

  it('preserves parse_mode', () => {
    const extra = { caption: 'Hello', parse_mode: 'Markdown' };
    const result = sanitizeTelegramExtra(extra);
    expect(result.parse_mode).toBe('Markdown');
  });
});

describe('sanitizeJsonStrings', () => {
  it('sanitizes all string values in a nested object', () => {
    const obj = {
      name: 'Test\uD800',
      nested: {
        description: 'Desc\uDFFF',
      },
      items: ['a\uD800', 'b'],
    };
    const result = sanitizeJsonStrings(obj);
    expect(result.name).toBe('Test');
    expect(result.nested.description).toBe('Desc');
    expect(result.items[0]).toBe('a');
    expect(result.items[1]).toBe('b');
  });

  it('sanitizes array of strings', () => {
    const arr = ['hello\uD800', 'world\uDFFF'];
    const result = sanitizeJsonStrings(arr);
    expect(result[0]).toBe('hello');
    expect(result[1]).toBe('world');
  });
});

describe('validateDbInput', () => {
  it('normalizes clean text', () => {
    expect(validateDbInput('Hello', 'test')).toBe('Hello');
  });

  it('sanitizes and returns corrupted text instead of throwing', () => {
    const result = validateDbInput('Hello\uD800', 'test');
    expect(result).toBe('Hello');
  });
});

describe('sanitizeTextArray', () => {
  it('sanitizes each string in array', () => {
    const arr = ['Clean', 'Bad\uD800'];
    const result = sanitizeTextArray(arr);
    expect(result[0]).toBe('Clean');
    expect(result[1]).toBe('Bad');
  });
});

describe('ensureTelegramSafe', () => {
  it('returns sanitized text and does not throw', () => {
    expect(ensureTelegramSafe('Hello\uD800', 'test')).toBe('Hello');
    expect(ensureTelegramSafe('Clean', 'test')).toBe('Clean');
  });
});

// ─── Integration-Style Tests ──────────────────────────────

// ─── buildSafeTelegramButton Tests ─────────────────────────

describe('buildSafeTelegramButton', () => {
  it('returns empty string for empty input', () => {
    expect(buildSafeTelegramButton('')).toBe('');
    expect(buildSafeTelegramButton(null as any)).toBe('');
    expect(buildSafeTelegramButton(undefined as any)).toBe('');
  });

  it('preserves clean text', () => {
    expect(buildSafeTelegramButton('Hello World')).toBe('Hello World');
  });

  it('removes lone surrogates', () => {
    expect(buildSafeTelegramButton('Hello\uD800World')).toBe('HelloWorld');
  });

  it('never splits emoji (📊)', () => {
    const text = '✅ جدول مقایسه و بررسی پراپ ها⚖️📊';
    const result = buildSafeTelegramButton(text);
    expect(validateUnicode(result).valid).toBe(true);
    expect(result).toBe(text);
  });

  it('preserves all types of emoji', () => {
    const emojis = [
      '😀', '🎉', '🚀', '💯', '🔥', '🌟', '⭐',
      '⚖️📊', '👨‍💻', '👨🏽‍💻', '🇮🇷', '🇺🇸', '🏳️‍🌈',
      '👨‍👩‍👧‍👦', '👍🏻',
    ];
    for (const emoji of emojis) {
      const result = buildSafeTelegramButton(emoji);
      expect(validateUnicode(result).valid).toBe(true);
    }
  });

  it('truncates by grapheme cluster, not code unit', () => {
    const manyEmojis = '😀'.repeat(200); // 200 graphemes
    const result = buildSafeTelegramButton(manyEmojis);
    expect(graphemeCount(result)).toBeLessThanOrEqual(TELEGRAM_BUTTON_TEXT_MAX);
    expect(validateUnicode(result).valid).toBe(true);
  });

  it('preserves ZWJ sequences', () => {
    const family = '👨‍👩‍👧‍👦';
    expect(buildSafeTelegramButton(family)).toBe(family);
  });

  it('preserves skin-tone modifiers', () => {
    const withTone = '👍🏻👍🏼👍🏽👍🏾👍🏿';
    const result = buildSafeTelegramButton(withTone);
    expect(result).toBe(withTone);
  });

  it('preserves country flags', () => {
    const flags = '🇮🇷🇺🇸🇬🇧🇩🇪🇫🇷';
    expect(buildSafeTelegramButton(flags)).toBe(flags);
  });

  it('handles Persian text with emoji', () => {
    const text = '🔥 تخفیف ویژه پراپ فرم FTMO';
    expect(buildSafeTelegramButton(text)).toBe(text);
  });

  it('handles RTL + LTR mixed text', () => {
    const text = 'Hello سلام 123 😀';
    expect(buildSafeTelegramButton(text)).toBe(text);
  });

  it('custom max grapheme limit', () => {
    const text = 'hello😀world';
    const result = buildSafeTelegramButton(text, 6);
    expect(graphemeCount(result)).toBeLessThanOrEqual(6);
    expect(validateUnicode(result).valid).toBe(true);
  });
});

// ─── validateButtonPayload Tests ───────────────────────────

describe('validateButtonPayload', () => {
  it('validates clean keyboard', () => {
    const keyboard = [[{ text: 'Click', callback_data: 'data' }]];
    const result = validateButtonPayload(keyboard);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects button with lone surrogate', () => {
    const keyboard = [[{ text: 'Click\uD800', callback_data: 'data' }]];
    const result = validateButtonPayload(keyboard);
    expect(result.valid).toBe(false);
  });

  it('rejects null button', () => {
    const keyboard = [[null]];
    const result = validateButtonPayload(keyboard);
    expect(result.valid).toBe(false);
  });

  it('rejects non-array rows', () => {
    const keyboard = ['notarray' as any];
    const result = validateButtonPayload(keyboard);
    expect(result.valid).toBe(false);
  });

  it('validates callback_data length', () => {
    const keyboard = [[{ text: 'Click', callback_data: 'x'.repeat(65) }]];
    const result = validateButtonPayload(keyboard);
    expect(result.valid).toBe(false);
  });

  it('accepts emoji-filled buttons', () => {
    const keyboard = [
      [{ text: '✅ جدول مقایسه و بررسی پراپ ها⚖️📊', callback_data: 'post:1' }],
      [{ text: '🔥 تخفیف ویژه', callback_data: 'post:2' }],
    ];
    const result = validateButtonPayload(keyboard);
    expect(result.valid).toBe(true);
  });

  it('rejects null/undefined input', () => {
    expect(validateButtonPayload(null as any).valid).toBe(false);
    expect(validateButtonPayload(undefined as any).valid).toBe(false);
  });
});

describe('Full pipeline integration', () => {
  it('handles Persian button text with zero-width non-joiner', () => {
    const text = 'گزارشات';
    expect(sanitizeTelegramText(text, TELEGRAM_BUTTON_TEXT_MAX)).toBe(text);
  });

  it('handles bot admin panel static button label', () => {
    const labels = [
      '👨‍💼 پنل ادمین',
      '📝 پست‌ها',
      '🎛 ویرایش منو',
      '⚙️ تنظیمات',
      '↩️ بازگشت به منوی اصلی',
    ];
    for (const label of labels) {
      const result = sanitizeTelegramText(label);
      expect(result).toBe(label);
      expect(validateUnicode(result).valid).toBe(true);
    }
  });

  it('handles post editor keyboard static labels', () => {
    const labels = [
      '✏ ویرایش عنوان',
      '📝 ویرایش محتوا',
      '🖼 تغییر رسانه',
      '⌨ ویرایش دکمه‌ها',
      '🧪 پیش‌نمایش',
      '📤 انتشار',
    ];
    for (const label of labels) {
      const result = sanitizeTelegramText(label);
      expect(result).toBe(label);
    }
  });

  it('handles pure ASCII', () => {
    expect(sanitizeTelegramText('Hello World!')).toBe('Hello World!');
  });

  it('handles mixed Arabic and emoji', () => {
    const text = 'مرحباً 😀 العالم';
    const result = sanitizeTelegramText(text);
    expect(result).toBe(text);
  });

  it('handles Turkish characters', () => {
    const text = 'İstanbul Şehir Merkezi çünkü ğüşö';
    expect(sanitizeTelegramText(text)).toBe(text);
  });

  it('handles Russian/Cyrillic', () => {
    const text = 'Привет, как дела?';
    expect(sanitizeTelegramText(text)).toBe(text);
  });

  it('handles Chinese', () => {
    const text = '你好世界';
    expect(sanitizeTelegramText(text)).toBe(text);
  });

  it('handles Japanese', () => {
    const text = 'こんにちは世界';
    expect(sanitizeTelegramText(text)).toBe(text);
  });

  it('handles Korean', () => {
    const text = '안녕하세요 세계';
    expect(sanitizeTelegramText(text)).toBe(text);
  });

  it('handles mixed scripts in one string', () => {
    const text = 'Hello سلام 你好 こんにちは Привет 안녕';
    expect(sanitizeTelegramText(text)).toBe(text);
  });

  it('handles keyboard markup with RTL labels', () => {
    const extra = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'داشبورد', callback_data: 'dashboard' }],
          [{ text: 'کاربران', callback_data: 'users' }],
        ],
      },
    };
    const result = sanitizeTelegramExtra(extra);
    expect(result.reply_markup.inline_keyboard[0][0].text).toBe('داشبورد');
    expect(result.reply_markup.inline_keyboard[1][0].text).toBe('کاربران');
  });
});
