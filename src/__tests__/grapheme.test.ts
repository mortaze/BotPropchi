import { describe, it, expect } from 'vitest';
import {
  graphemeCount,
  graphemeSlice,
  graphemeTruncate,
  graphemeSafeLength,
} from '../utils/grapheme';
import { buildSafeTelegramButton, validateUnicode } from '../utils/unicode';

describe('graphemeCount', () => {
  it('counts ASCII characters', () => {
    expect(graphemeCount('hello')).toBe(5);
  });

  it('counts Persian characters', () => {
    expect(graphemeCount('سلام')).toBe(4);
  });

  it('counts emoji as single grapheme', () => {
    expect(graphemeCount('😀')).toBe(1);
  });

  it('counts ZWJ family emoji as single grapheme', () => {
    expect(graphemeCount('👨‍👩‍👧‍👦')).toBe(1);
  });

  it('counts skin-tone emoji as single grapheme', () => {
    expect(graphemeCount('👍🏻')).toBe(1);
  });

  it('counts country flag as single grapheme', () => {
    expect(graphemeCount('🇮🇷')).toBe(1);
  });

  it('counts mixed text with emoji correctly', () => {
    const text = 'Hello 😀 world 🌍';
    // H(1) e(2) l(3) l(4) o(5) (6) 😀(7) (8) w(9) o(10) r(11) l(12) d(13) (14) 🌍(15)
    expect(graphemeCount(text)).toBe(15);
  });

  it('counts Persian with emoji correctly', () => {
    const text = '✅ جدول مقایسه';
    // ✅(1) (2) ج(3) د(4) و(5) ل(6) (7) م(8) ق(9) ا(10) ی(11) س(12) ه(13)
    expect(graphemeCount(text)).toBe(13);
  });

  it('counts rainbow flag (multi-codepoint ZWJ)', () => {
    expect(graphemeCount('🏳️‍🌈')).toBe(1);
  });

  it('counts man health worker ZWJ', () => {
    expect(graphemeCount('👨‍⚕️')).toBe(1);
  });

  it('handles empty string', () => {
    expect(graphemeCount('')).toBe(0);
  });

  it('handles null/undefined', () => {
    expect(graphemeCount(null as any)).toBe(0);
    expect(graphemeCount(undefined as any)).toBe(0);
  });
});

describe('graphemeTruncate', () => {
  it('returns full text if under limit', () => {
    expect(graphemeTruncate('hello', 10)).toBe('hello');
  });

  it('truncates ASCII at grapheme boundary', () => {
    expect(graphemeTruncate('hello world', 5)).toBe('hello');
  });

  it('never splits an emoji', () => {
    const text = 'hello😀world';
    const result = graphemeTruncate(text, 6);
    expect(result).toBe('hello😀');
    expect(graphemeCount(result)).toBe(6);
    expect(validateUnicode(result).valid).toBe(true);
  });

  it('never splits ZWJ family emoji', () => {
    const text = 'a👨‍👩‍👧‍👦b';
    const result = graphemeTruncate(text, 2);
    expect(result).toBe('a👨‍👩‍👧‍👦');
    expect(validateUnicode(result).valid).toBe(true);
  });

  it('never splits skin-tone emoji', () => {
    const text = 'ab👍🏻cd';
    const result = graphemeTruncate(text, 3);
    expect(result).toBe('ab👍🏻');
    expect(validateUnicode(result).valid).toBe(true);
  });

  it('never splits country flag', () => {
    const text = 'ab🇮🇷cd';
    const result = graphemeTruncate(text, 3);
    expect(result).toBe('ab🇮🇷');
    expect(validateUnicode(result).valid).toBe(true);
  });

  it('never splits 📊 emoji (the reported bug)', () => {
    const text = '✅ جدول مقایسه و بررسی پراپ ها⚖️📊';
    const result = graphemeTruncate(text, 25);
    expect(validateUnicode(result).valid).toBe(true);
  });

  it('handles 100 emoji chain', () => {
    const emojis = '😀'.repeat(100);
    const result = graphemeTruncate(emojis, 50);
    expect(graphemeCount(result)).toBe(50);
    expect(validateUnicode(result).valid).toBe(true);
  });

  it('truncates to 0 gives empty string', () => {
    expect(graphemeTruncate('hello', 0)).toBe('');
  });

  it('handles empty string', () => {
    expect(graphemeTruncate('', 10)).toBe('');
    expect(graphemeTruncate(null as any, 10)).toBe(null);
    expect(graphemeTruncate(undefined as any, 10)).toBe(undefined);
  });
});

describe('graphemeSlice', () => {
  it('slices ASCII', () => {
    expect(graphemeSlice('hello', 1, 4)).toBe('ell');
  });

  it('slices with emoji', () => {
    const text = 'a😀b🇮🇷c';
    expect(graphemeSlice(text, 1, 3)).toBe('😀b');
  });

  it('never splits surrogate pairs', () => {
    const text = 'abc📊def';
    const sliced = graphemeSlice(text, 2, 5);
    expect(sliced).toBe('c📊d');
    expect(validateUnicode(sliced).valid).toBe(true);
  });

  it('slice start only', () => {
    const text = 'hello😀world';
    expect(graphemeSlice(text, 5)).toBe('😀world');
  });
});

describe('graphemeSafeLength', () => {
  it('returns true when within limit', () => {
    expect(graphemeSafeLength('hello', 10)).toBe(true);
  });

  it('returns false when over limit', () => {
    expect(graphemeSafeLength('hello😀world', 5)).toBe(false);
  });
});

describe('REGRESSION: bug report scenario', () => {
  it('does NOT corrupt post title in post list keyboard', () => {
    const title = '✅ جدول مقایسه و بررسی پراپ ها⚖️📊';
    const truncated = graphemeTruncate(title, 28);
    expect(graphemeCount(truncated)).toBeLessThanOrEqual(28);
    expect(validateUnicode(truncated).valid).toBe(true);
  });

  it('full pipeline preserves Persian + emoji mix through DB→Keyboard→Telegram', () => {
    const titles = [
      '✅ جدول مقایسه و بررسی پراپ ها⚖️📊',
      '🏆 برندگان مسابقه',
      '🔥 تخفیف ویژه پراپ فرم FTMO',
      '💰 کد تخفیف ۵۰٪',
      '📈 آموزش پراپ تریدینگ',
      '🇮🇷 خدمات ویژه کاربران ایرانی',
      '👨‍💻 آموزش حرفه‌ای',
      '🏳️‍🌈 پشتیبانی',
    ];
    for (const title of titles) {
      const safe = buildSafeTelegramButton(title);
      expect(validateUnicode(safe).valid).toBe(true);
    }
  });

  it('no corruption when truncation is needed', () => {
    const longTitle = '✅ جدول مقایسه و بررسی پراپ ها⚖️📊🔥💰📈🇮🇷🏆 اضافه';
    const safe = buildSafeTelegramButton(longTitle, 20);
    expect(graphemeCount(safe)).toBeLessThanOrEqual(20);
    expect(validateUnicode(safe).valid).toBe(true);
  });
});
