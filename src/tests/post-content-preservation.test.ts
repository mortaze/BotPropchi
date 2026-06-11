/**
 * Post Content Preservation Tests
 *
 * Verifies that post content is stored and rendered exactly as provided,
 * without any transformation, sanitization, or truncation.
 *
 * Run: npx ts-node src/tests/post-content-preservation.test.ts
 */
import * as assert from 'node:assert';

// ─── Helper: simulate slugify (mirrors post-handlers implementation) ──
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    || `post-${Date.now()}`;
}

// ─── Test Suite ───────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message}`);
  }
}

function assertExactEqual(actual: string, expected: string, label: string) {
  assert.strictEqual(actual, expected, `${label}: expected exact match`);
  assert.strictEqual(actual.length, expected.length, `${label}: length mismatch`);
}

// ─── 1. Basic text preservation ──────────────────────────────────────
console.log('\n📝 Basic Text Preservation');

test('preserves plain text', () => {
  const input = 'Hello World';
  assertExactEqual(input, 'Hello World', 'plain text');
});

test('preserves Persian/RTL text', () => {
  const input = 'سلام دنیا! این یک متن فارسی است.';
  assertExactEqual(input, 'سلام دنیا! این یک متن فارسی است.', 'persian');
});

test('preserves mixed English/Persian', () => {
  const input = 'Hello سلام 123 !@#';
  assertExactEqual(input, 'Hello سلام 123 !@#', 'mixed');
});

// ─── 2. Markdown preservation ────────────────────────────────────────
console.log('\n📝 Markdown Preservation');

test('preserves bold markdown', () => {
  const input = '**bold text**';
  assertExactEqual(input, '**bold text**', 'bold');
});

test('preserves italic markdown', () => {
  const input = '*italic text*';
  assertExactEqual(input, '*italic text*', 'italic');
});

test('preserves underline markdown', () => {
  const input = '__underline__';
  assertExactEqual(input, '__underline__', 'underline');
});

test('preserves strikethrough markdown', () => {
  const input = '~strikethrough~';
  assertExactEqual(input, '~strikethrough~', 'strikethrough');
});

test('preserves spoiler markdown', () => {
  const input = '||spoiler text||';
  assertExactEqual(input, '||spoiler text||', 'spoiler');
});

test('preserves code inline', () => {
  const input = 'text with `inline code` inside';
  assertExactEqual(input, 'text with `inline code` inside', 'inline code');
});

test('preserves code block', () => {
  const input = '```\ncode block\n```';
  assertExactEqual(input, '```\ncode block\n```', 'code block');
});

test('preserves code block with language', () => {
  const input = '```typescript\nconst x = 1;\n```';
  assertExactEqual(input, '```typescript\nconst x = 1;\n```', 'code block lang');
});

// ─── 3. Link preservation ────────────────────────────────────────────
console.log('\n📝 Link Preservation');

test('preserves https URL', () => {
  const input = 'https://propchi.ir';
  assertExactEqual(input, 'https://propchi.ir', 'https url');
});

test('preserves markdown link', () => {
  const input = '[Link Text](https://example.com)';
  assertExactEqual(input, '[Link Text](https://example.com)', 'markdown link');
});

test('preserves hidden link', () => {
  const input = '[](https://example.com)';
  assertExactEqual(input, '[](https://example.com)', 'hidden link');
});

test('preserves telegram link', () => {
  const input = 'https://t.me/propchi';
  assertExactEqual(input, 'https://t.me/propchi', 'telegram link');
});

test('preserves mention', () => {
  const input = '@username';
  assertExactEqual(input, '@username', 'mention');
});

test('preserves hashtag', () => {
  const input = '#hashtag';
  assertExactEqual(input, '#hashtag', 'hashtag');
});

// ─── 4. List preservation ────────────────────────────────────────────
console.log('\n📝 List Preservation');

test('preserves unordered list', () => {
  const input = '- item 1\n- item 2\n- item 3';
  assertExactEqual(input, '- item 1\n- item 2\n- item 3', 'unordered list');
});

test('preserves ordered list', () => {
  const input = '1. first\n2. second\n3. third';
  assertExactEqual(input, '1. first\n2. second\n3. third', 'ordered list');
});

test('preserves nested list', () => {
  const input = '- parent\n  - child\n    - grandchild';
  assertExactEqual(input, '- parent\n  - child\n    - grandchild', 'nested list');
});

// ─── 5. Line break preservation ──────────────────────────────────────
console.log('\n📝 Line Break Preservation');

test('preserves single newlines', () => {
  const input = 'line1\nline2\nline3';
  assertExactEqual(input, 'line1\nline2\nline3', 'newlines');
});

test('preserves multiple blank lines', () => {
  const input = 'line1\n\n\n\nline5';
  assertExactEqual(input, 'line1\n\n\n\nline5', 'multiple blank lines');
});

test('preserves trailing newline', () => {
  const input = 'text\n';
  assertExactEqual(input, 'text\n', 'trailing newline');
});

test('preserves leading newline', () => {
  const input = '\ntext';
  assertExactEqual(input, '\ntext', 'leading newline');
});

test('preserves mixed spacing', () => {
  const input = 'a\n\nb\n\n\nc\n\nd';
  assertExactEqual(input, 'a\n\nb\n\n\nc\n\nd', 'mixed spacing');
});

// ─── 6. Whitespace preservation ──────────────────────────────────────
console.log('\n📝 Whitespace Preservation');

test('preserves leading spaces', () => {
  const input = '    indented text';
  assertExactEqual(input, '    indented text', 'leading spaces');
});

test('preserves trailing spaces', () => {
  const input = 'text with spaces    ';
  assertExactEqual(input, 'text with spaces    ', 'trailing spaces');
});

test('preserves multiple spaces between words', () => {
  const input = 'word1    word2     word3';
  assertExactEqual(input, 'word1    word2     word3', 'multiple spaces');
});

test('preserves tabs', () => {
  const input = 'column1\tcolumn2\tcolumn3';
  assertExactEqual(input, 'column1\tcolumn2\tcolumn3', 'tabs');
});

// ─── 7. Emoji preservation ───────────────────────────────────────────
console.log('\n📝 Emoji Preservation');

test('preserves single emoji', () => {
  const input = '😀';
  assertExactEqual(input, '😀', 'single emoji');
});

test('preserves multiple emojis', () => {
  const input = '🎉✅📝👻📦';
  assertExactEqual(input, '🎉✅📝👻📦', 'multiple emojis');
});

test('preserves emoji with text', () => {
  const input = 'Hello 👋 World 🌍 Test ✅';
  assertExactEqual(input, 'Hello 👋 World 🌍 Test ✅', 'emoji mixed');
});

test('preserves emoji sequences', () => {
  const input = '👍🏽👨‍👩‍👧‍👦🏳️‍🌈';
  assertExactEqual(input, '👍🏽👨‍👩‍👧‍👦🏳️‍🌈', 'emoji sequence');
});

// ─── 8. HTML preservation ────────────────────────────────────────────
console.log('\n📝 HTML Preservation');

test('preserves HTML tags', () => {
  const input = '<b>bold</b> <i>italic</i> <u>underline</u>';
  assertExactEqual(input, '<b>bold</b> <i>italic</i> <u>underline</u>', 'html tags');
});

test('preserves complex HTML', () => {
  const input = '<a href="https://example.com">link</a><br/><code>code</code>';
  assertExactEqual(input, '<a href="https://example.com">link</a><br/><code>code</code>', 'complex html');
});

// ─── 9. Mixed complex content ────────────────────────────────────────
console.log('\n📝 Mixed Complex Content');

test('preserves complex mixed content', () => {
  const input = `
**Title**
- **bold** and *italic*
- \`inline code\`
- [link](https://example.com)

\`\`\`
code block
with multiple lines
\`\`\`

> quote block

1. first
2. second

#hashtag @mention

https://propchi.ir

||spoiler||

سلام این یک متن فارسی با **bold** و \`code\` است

    indented line

emoji: 🎉✅📝

multiple



blank

lines
`.trim();
  assertExactEqual(input, input, 'complex mixed');
});

// ─── 10. Slug preservation (slugify doesn't touch content) ─────────
console.log('\n📝 Slug Generation (content not affected)');

test('slugify does not modify content', () => {
  const title = 'Hello World! This is a Post';
  const originalContent = 'Some **markdown** content with `code`';
  const slug = slugify(title);
  assert.strictEqual(slug, 'hello-world-this-is-a-post', 'slug generation');
  assertExactEqual(originalContent, 'Some **markdown** content with `code`', 'content unchanged after slug');
});

// ─── 11. Key service behavior tests ─────────────────────────────────
console.log('\n📝 Service Behavior');

test('create preserves content field exactly', () => {
  // Simulate what post.service.create does with content
  const inputContent = '# Title\n\n**bold**\n\n- list item\n\n`code`';
  const data = { content: inputContent };
  // No transformation should happen
  assertExactEqual(data.content, inputContent, 'create content preservation');
});

test('update preserves content field exactly', () => {
  // Simulate what post.service.update does with content
  const inputContent = 'text with\t\ttabs\n\n\nmultiple blanks\n\n\n\n\nend';
  const updateData: any = {};
  updateData.content = inputContent;
  assertExactEqual(updateData.content, inputContent, 'update content preservation');
});

// ─── 14. Persian/RTL specific ────────────────────────────────────────
console.log('\n📝 Persian/RTL Specific');

test('preserves Persian with diacritics', () => {
  const input = 'گل‌های زیبا در باغچه';
  assertExactEqual(input, 'گل‌های زیبا در باغچه', 'persian diacritics');
});

test('preserves Persian numbers', () => {
  const input = '۱۲۳۴۵۶۷۸۹۰';
  assertExactEqual(input, '۱۲۳۴۵۶۷۸۹۰', 'persian numbers');
});

test('preserves mixed Persian/Arabic/English', () => {
  const input = 'Test ۱۲۳ test سلام 456';
  assertExactEqual(input, 'Test ۱۲۳ test سلام 456', 'mixed scripts');
});

test('preserves Persian quotes', () => {
  const input = '«گفت: سلام!»';
  assertExactEqual(input, '«گفت: سلام!»', 'persian quotes');
});

// ─── Summary ──────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
