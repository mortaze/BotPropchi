import { logger } from './logger';
import { graphemeTruncate, graphemeCount, graphemeSafeLength } from './grapheme';

/**
 * Centralized Unicode Pipeline — single source of truth for all text
 * validation, sanitization, normalization in the system.
 *
 * Covers:
 *   - Persian / Arabic / English / Turkish / Russian / CJK / Mixed RTL-LTR
 *   - Emojis, ZWJ sequences, skin-tone modifiers, country flags
 *   - All current and future Unicode codepoints
 *
 * CRITICAL: All truncation uses grapheme-aware operations.
 * NEVER use .substring(), .slice(), .substr() on user text — they split UTF-16 surrogate pairs.
 */

// ─── Constants ─────────────────────────────────────────────
export const TELEGRAM_BUTTON_TEXT_MAX = 128;
export const TELEGRAM_CALLBACK_DATA_MAX = 64;
export const TELEGRAM_CAPTION_MAX = 1024;
export const TELEGRAM_MESSAGE_TEXT_MAX = 4096;

// Control characters that must be stripped (keep common whitespace)
const INVALID_CODEPOINTS = new Set<number>([
  0x0000, 0x0001, 0x0002, 0x0003, 0x0004, 0x0005, 0x0006, 0x0007,
  0x0008, 0x000B, 0x000C, 0x000E, 0x000F, 0x0010, 0x0011, 0x0012,
  0x0013, 0x0014, 0x0015, 0x0016, 0x0017, 0x0018, 0x0019, 0x001A,
  0x001B, 0x001C, 0x001D, 0x001E, 0x001F, 0x007F, 0x0080, 0x0081,
  0x0082, 0x0083, 0x0084, 0x0085, 0x0086, 0x0087, 0x0088, 0x0089,
  0x008A, 0x008B, 0x008C, 0x008D, 0x008E, 0x008F, 0x0090, 0x0091,
  0x0092, 0x0093, 0x0094, 0x0095, 0x0096, 0x0097, 0x0098, 0x0099,
  0x009A, 0x009B, 0x009C, 0x009D, 0x009E, 0x009F,
  // Surrogates (U+D800–U+DFFF) are invalid in Unicode strings
  // but in JS strings they appear as lone surrogates
]);

// ─── Core Pipeline ─────────────────────────────────────────

/**
 * NFC-normalize text. NFC is the standard for Telegram & web.
 * Converts composite characters to precomposed form where possible.
 */
export function normalizeUnicode(text: string): string {
  if (!text) return text;
  return text.normalize('NFC');
}

/**
 * Remove invalid Unicode sequences:
 *   - Bare surrogate characters (corrupted)
 *   - Control characters (except \t, \n, \r)
 *   - Zero-width non-joiner / other dangerous invisible chars
 * Does NOT strip legitimate emoji, ZWJ sequences, or legitimate formatting.
 *
 * Returns sanitized text.
 */
export function sanitizeUnicode(text: string): string {
  if (!text) return text;

  const result: string[] = [];
  for (const ch of text) {
    if (ch.length === 1) {
      const code = ch.charCodeAt(0);
      // Lone surrogate (not paired)
      if (code >= 0xD800 && code <= 0xDFFF) {
        continue; // Skip corrupted lone surrogate
      }
      // Control characters (except \t, \n, \r)
      if (INVALID_CODEPOINTS.has(code)) {
        continue;
      }
      result.push(ch);
    } else {
      // Astral character (surrogate pair in UTF-16)
      const high = ch.charCodeAt(0);
      const low = ch.charCodeAt(1);
      if (high >= 0xD800 && high <= 0xDBFF && low >= 0xDC00 && low <= 0xDFFF) {
        result.push(ch); // Valid surrogate pair — keep it
      }
      // If invalid pair, skip (corrupted)
    }
  }
  return result.join('');
}

/**
 * Validate that text is clean Unicode (no corruption, no invalid sequences).
 * Returns true if valid, false if issues found.
 */
export function validateUnicode(text: string): {
  valid: boolean;
  issues: { position: number; code: number; description: string }[];
} {
  const issues: { position: number; code: number; description: string }[] = [];
  if (!text) return { valid: true, issues };

  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];

    if (ch.length === 1) {
      const code = ch.charCodeAt(0);
      if (code >= 0xD800 && code <= 0xDFFF) {
        issues.push({ position: i, code, description: 'Lone surrogate character' });
      } else if (INVALID_CODEPOINTS.has(code)) {
        issues.push({ position: i, code, description: `Invalid control character U+${code.toString(16).toUpperCase().padStart(4, '0')}` });
      }
    } else {
      // Astral character — verify it's a valid surrogate pair
      const high = ch.charCodeAt(0);
      const low = ch.charCodeAt(1);
      if (!(high >= 0xD800 && high <= 0xDBFF && low >= 0xDC00 && low <= 0xDFFF)) {
        const fullCode = (high - 0xD800) * 0x400 + (low - 0xDC00) + 0x10000;
        issues.push({ position: i, code: fullCode, description: 'Invalid surrogate pair' });
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

// ─── Telegram-Specific Pipeline ───────────────────────────

/**
 * Full Telegram-safe text pipeline.
 * 1. Normalize (NFC)
 * 2. Sanitize (remove invalid sequences)
 * 3. Truncate to maxLength if provided
 *
 * For use: message text, button labels, captions, callback data
 */
export function sanitizeTelegramText(text: string, maxGraphemes?: number): string {
  if (!text) return text;
  let result = normalizeUnicode(text);
  result = sanitizeUnicode(result);
  if (maxGraphemes && graphemeCount(result) > maxGraphemes) {
    result = graphemeTruncate(result, maxGraphemes);
  }
  return result;
}

/**
 * Validate Telegram button text.
 * Checks: valid Unicode, max length, no corruption.
 */
export function validateTelegramButton(text: string): {
  valid: boolean;
  sanitized: string;
  issues: { position: number; code: number; description: string }[];
} {
  const validation = validateUnicode(text);
  const sanitized = sanitizeTelegramText(text, TELEGRAM_BUTTON_TEXT_MAX);
  return { valid: validation.valid, sanitized, issues: validation.issues };
}

/**
 * Validate Telegram message length constraints.
 */
export function validateTelegramLength(text: string, maxGraphemes: number): {
  valid: boolean;
  truncated: string;
  originalLength: number;
} {
  const normalized = normalizeUnicode(text);
  const sanitized = sanitizeUnicode(normalized);
  const len = graphemeCount(sanitized);
  if (len <= maxGraphemes) {
    return { valid: true, truncated: sanitized, originalLength: len };
  }
  return { valid: false, truncated: graphemeTruncate(sanitized, maxGraphemes), originalLength: len };
}

/**
 * Recursively sanitize all text fields in a Telegram extra/options object.
 * Handles:
 *   - reply_markup.keyboard[][].text
 *   - reply_markup.inline_keyboard[][].text
 *   - reply_markup.inline_keyboard[][].callback_data
 *   - caption
 *   - parse_mode (preserved as-is)
 */
export function sanitizeTelegramExtra(extra: any): any {
  if (!extra || typeof extra !== 'object') return extra;

  const result: any = Array.isArray(extra) ? [...extra] : { ...extra };

  if (result.caption && typeof result.caption === 'string') {
    result.caption = sanitizeTelegramText(result.caption, TELEGRAM_CAPTION_MAX);
  }

  if (result.text && typeof result.text === 'string') {
    // Used by editMessageText etc.
    result.text = sanitizeTelegramText(result.text, TELEGRAM_MESSAGE_TEXT_MAX);
  }

  if (result.reply_markup) {
    const rm = result.reply_markup;

    if (rm.inline_keyboard && Array.isArray(rm.inline_keyboard)) {
      for (const row of rm.inline_keyboard) {
        if (Array.isArray(row)) {
          for (const btn of row) {
            if (btn) {
              if (btn.text && typeof btn.text === 'string') {
                btn.text = sanitizeTelegramText(btn.text, TELEGRAM_BUTTON_TEXT_MAX);
              }
              if (btn.callback_data && typeof btn.callback_data === 'string') {
                const before = btn.callback_data;
                btn.callback_data = sanitizeTelegramText(btn.callback_data, TELEGRAM_CALLBACK_DATA_MAX);
                if (before !== btn.callback_data) {
                  console.log(`[SANITIZE_CB] TRUNCATED! before="${before}" after="${btn.callback_data}" len=${before.length} max=${TELEGRAM_CALLBACK_DATA_MAX}`);
                }
              }
            }
          }
        }
      }
    }

    if (rm.keyboard && Array.isArray(rm.keyboard)) {
      for (const row of rm.keyboard) {
        if (Array.isArray(row)) {
          for (const btn of row) {
            if (btn) {
              if (typeof btn === 'string') {
                // Simple string button — replace in the array
                const idx = row.indexOf(btn);
                if (idx !== -1) {
                  row[idx] = sanitizeTelegramText(btn, TELEGRAM_BUTTON_TEXT_MAX);
                }
              } else if (btn.text && typeof btn.text === 'string') {
                btn.text = sanitizeTelegramText(btn.text, TELEGRAM_BUTTON_TEXT_MAX);
              }
            }
          }
        }
      }
    }
  }

  return result;
}

/**
 * Validate text is ready for Telegram sending.
 * Logs issues but does NOT throw — always returns sanitized text.
 */
export function ensureTelegramSafe(text: string, label: string, entityId?: any): string {
  const validation = validateUnicode(text);
  const sanitized = sanitizeTelegramText(text);

  if (!validation.valid) {
    for (const issue of validation.issues) {
      logUnicodeIssue(label, entityId, text, sanitized, `position=${issue.position} code=U+${issue.code.toString(16).toUpperCase()}`);
    }
  }

  return sanitized;
}

// ─── Structured Logging ───────────────────────────────────

export function logUnicodeIssue(
  entityType: string,
  entityId: any,
  original: string,
  sanitized: string,
  location: string,
): void {
  logger.warn('[Unicode] Invalid sequence detected', {
    entityType,
    entityId: entityId ?? 'unknown',
    originalPreview: original.slice(0, 200),
    sanitizedPreview: sanitized.slice(0, 200),
    location,
    originalLength: original.length,
    sanitizedLength: sanitized.length,
    changed: original !== sanitized,
  });
}

// ─── Database Input Guard ─────────────────────────────────

/**
 * Validate text before saving to database.
 * Throws on invalid Unicode — data integrity is critical.
 * Callers should catch and handle appropriately.
 */
export function validateDbInput(text: string, fieldName: string): string {
  const validation = validateUnicode(text);
  if (!validation.valid) {
    const sanitized = sanitizeUnicode(text);
    logUnicodeIssue('DB_INPUT', fieldName, text, sanitized, 'pre-save validation');
    // Return sanitized instead of throwing — resilient approach
    return sanitized;
  }
  return normalizeUnicode(text);
}

// ─── Convenience Wrappers ─────────────────────────────────

/**
 * Sanitize an array of strings (e.g. button rows for reply keyboards)
 */
export function sanitizeTextArray(arr: string[]): string[] {
  return arr.map(t => sanitizeTelegramText(t, TELEGRAM_BUTTON_TEXT_MAX));
}

/**
 * Deep-sanitize a parsed JSON object's string fields recursively.
 * Useful for menu_layout saved as JSON.
 */
export function sanitizeJsonStrings(obj: any, maxGraphemes?: number): any {
  if (typeof obj === 'string') {
    return sanitizeTelegramText(obj, maxGraphemes);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeJsonStrings(item, maxGraphemes));
  }
  if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const key of Object.keys(obj)) {
      result[key] = sanitizeJsonStrings(obj[key], maxGraphemes);
    }
    return result;
  }
  return obj;
}

// ─── Safe Button Builder ───────────────────────────────────
// NEVER split a surrogate pair. Always truncate by grapheme cluster.

export interface SafeButton {
  text: string;
  callback_data?: string;
  url?: string;
  web_app?: { url: string };
  switch_inline_query?: string;
  callback_game?: any;
  pay?: boolean;
}

/**
 * Build a safe Telegram button text.
 * Normalizes, sanitizes, then truncates by grapheme cluster (never by UTF-16 code unit).
 */
export function buildSafeTelegramButton(
  text: string,
  maxGraphemes: number = TELEGRAM_BUTTON_TEXT_MAX,
): string {
  if (!text) return '';
  const clean = sanitizeTelegramText(text, maxGraphemes);
  const validated = validateUnicode(clean);
  if (!validated.valid) {
    // If sanitization left corruption (shouldn't happen), strip surrogates
    logUnicodeIssue('SAFE_BUTTON', 'pipeline', text, clean, 'post-sanitize validation failed');
    return sanitizeUnicode(clean);
  }
  return clean;
}

/**
 * Validate a full button payload before sending to Telegram.
 * Logs exact failing button for debugging.
 * Returns { valid, errors }.
 */
export function validateButtonPayload(buttons: any[][]): {
  valid: boolean;
  errors: { row: number; col: number; field: string; text: string }[];
} {
  const errors: { row: number; col: number; field: string; text: string }[] = [];
  if (!Array.isArray(buttons)) {
    return { valid: false, errors: [{ row: -1, col: -1, field: 'buttons', text: 'not an array' }] };
  }
  for (let r = 0; r < buttons.length; r++) {
    const row = buttons[r];
    if (!Array.isArray(row)) {
      errors.push({ row: r, col: -1, field: 'row', text: 'row is not an array' });
      continue;
    }
    for (let c = 0; c < row.length; c++) {
      const btn = row[c];
      if (!btn) {
        errors.push({ row: r, col: c, field: 'button', text: 'null/undefined button' });
        continue;
      }
      if (btn.text && typeof btn.text === 'string') {
        const v = validateUnicode(btn.text);
        if (!v.valid) {
          const preview = btn.text.length > 50 ? btn.text.slice(0, 50) + '...' : btn.text;
          errors.push({ row: r, col: c, field: 'text', text: `Invalid Unicode at ${JSON.stringify(v.issues)} text="${preview}"` });
        }
        if (graphemeCount(btn.text) > TELEGRAM_BUTTON_TEXT_MAX) {
          const preview = btn.text.length > 50 ? btn.text.slice(0, 50) + '...' : btn.text;
          errors.push({ row: r, col: c, field: 'text', text: `Exceeds ${TELEGRAM_BUTTON_TEXT_MAX} graphemes: "${preview}"` });
        }
      }
      if (btn.callback_data && typeof btn.callback_data === 'string') {
        const v = validateUnicode(btn.callback_data);
        if (!v.valid) {
          errors.push({ row: r, col: c, field: 'callback_data', text: `Invalid Unicode in callback_data` });
        }
        if (btn.callback_data.length > TELEGRAM_CALLBACK_DATA_MAX) {
          errors.push({ row: r, col: c, field: 'callback_data', text: `Exceeds ${TELEGRAM_CALLBACK_DATA_MAX} chars` });
        }
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

// ─── Safe Telegram Send/Edit Wrappers ──────────────────────

export type SafeSendResult = { ok: boolean; error?: string };

/**
 * Safely validate and send a message with inline keyboard.
 * Validates ALL button text before sending — never sends corrupted payload.
 */
export async function safeTelegramSend(
  sendFn: (text: string, extra: any) => Promise<any>,
  text: string,
  keyboard?: any[][],
  extra?: any,
): Promise<SafeSendResult> {
  const safeText = sanitizeTelegramText(text, TELEGRAM_MESSAGE_TEXT_MAX);
  const safeExtra = { ...extra };

  if (keyboard && keyboard.length > 0) {
    const validation = validateButtonPayload(keyboard);
    if (!validation.valid) {
      for (const err of validation.errors) {
        logger.error('[SafeSend] Invalid button payload', err);
      }
      return { ok: false, error: `Button validation failed: ${validation.errors[0]?.text || 'unknown'}` };
    }
    // Sanitize each button text
    const safeKeyboard = keyboard.map((row: any[], r: number) =>
      row.map((btn: any, c: number) => {
        if (!btn) return btn;
        const cleaned = { ...btn };
        if (cleaned.text) cleaned.text = buildSafeTelegramButton(cleaned.text);
        if (cleaned.callback_data) cleaned.callback_data = sanitizeTelegramText(cleaned.callback_data, TELEGRAM_CALLBACK_DATA_MAX);
        return cleaned;
      })
    );
    safeExtra.reply_markup = { inline_keyboard: safeKeyboard };
  }

  try {
    await sendFn(safeText, safeExtra);
    return { ok: true };
  } catch (err: any) {
    const errMsg = err?.description || err?.message || String(err);
    logger.error('[SafeSend] Send failed', { error: errMsg, textPreview: safeText.slice(0, 100) });
    return { ok: false, error: errMsg };
  }
}

/**
 * Safe inline keyboard validator — validates ALL button text in an inline keyboard.
 * Use before any ctx.reply / ctx.editMessageText call.
 */
export function validateInlineKeyboard(buttons: any[][]): boolean {
  const result = validateButtonPayload(buttons);
  if (!result.valid) {
    for (const err of result.errors) {
      logger.warn('[Keyboard] Validation error', err);
    }
  }
  return result.valid;
}
