import { describe, expect, it } from 'vitest';
import { validateTelegramButton } from '../utils/unicode';

type Button = {
  id: string;
  ref: string;
  text: string;
  label?: string;
  title?: string;
  emoji?: string;
  visible?: boolean;
  metadata?: Record<string, unknown>;
};

function moveButton(layout: Button[][], rowIndex: number, fromIndex: number, toIndex: number) {
  const next = layout.map((row) => row.map((button) => ({ ...button, metadata: { ...button.metadata } })));
  const [button] = next[rowIndex].splice(fromIndex, 1);
  next[rowIndex].splice(toIndex, 0, button);
  return next;
}

describe('menu Unicode stability', () => {
  it('preserves Persian, Unicode, emoji, and metadata when reordering buttons', () => {
    const layout: Button[][] = [[
      { id: 'btn_1', ref: 'system:discounts', text: '🎁 تخفیف ویژه پراپ', label: '🎁 تخفیف ویژه پراپ', emoji: '🎁', visible: true, metadata: { rowIndex: 0, position: 0 } },
      { id: 'btn_2', ref: 'post:42', text: 'تحلیل بازار EUR/USD 📈', title: 'تحلیل بازار EUR/USD 📈', emoji: '📈', visible: true, metadata: { rowIndex: 0, position: 1 } },
      { id: 'btn_3', ref: 'system:support', text: 'پشتیبانی ۲۴/۷ ☎️', emoji: '☎️', visible: true, metadata: { rowIndex: 0, position: 2 } },
    ]];

    const reordered = moveButton(layout, 0, 0, 2);

    expect(reordered[0].map((button) => button.text)).toEqual([
      'تحلیل بازار EUR/USD 📈',
      'پشتیبانی ۲۴/۷ ☎️',
      '🎁 تخفیف ویژه پراپ',
    ]);
    expect(reordered[0][2].label).toBe('🎁 تخفیف ویژه پراپ');
    expect(reordered[0][2].metadata).toEqual({ rowIndex: 0, position: 0 });
    expect(JSON.stringify(reordered)).not.toContain('???');
  });

  it('rejects malformed button text before persistence', () => {
    expect(validateTelegramButton('منوی فارسی ✅').valid).toBe(true);
    expect(validateTelegramButton('\uD800').valid).toBe(false);
  });
});

import { menuEditorKeyboard } from '../bot/keyboards/post-keyboards';

describe('menu editor keyboard rendering', () => {
  it('never renders ??? for empty raw post text; it falls back to ref until resolved titles arrive', () => {
    const keyboard = menuEditorKeyboard([[{ id: 'btn_10', ref: 'post:10', text: '', visible: true }]]) as any;
    const payload = JSON.stringify(keyboard.reply_markup);
    expect(payload).not.toContain('???');
    expect(payload).toContain('post:10');
  });
});
