/**
 * One-time repair script: scans DB for corrupted Unicode and fixes it.
 *
 * Run: npx ts-node src/scripts/repair-unicode.ts
 *
 * What it checks:
 *   1. Post.title, Post.content, Post.caption, Post.buttons (JSONB)
 *   2. SystemSetting.value (all settings)
 *   3. PropFirm.name, PropFirm.description
 *   4. Admin.firstName, Admin.lastName, Admin.username
 *
 * Dry-run mode: npx ts-node src/scripts/repair-unicode.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';
import { sanitizeUnicode, normalizeUnicode, validateUnicode, logUnicodeIssue } from '../utils/unicode';

const prisma = new PrismaClient();
const isDryRun = process.argv.includes('--dry-run');

interface RepairResult {
  entity: string;
  id: number | string;
  field: string;
  originalLength: number;
  fixedLength: number;
  issues: number;
}

async function main() {
  console.log(`\n🔍 Unicode Repair — ${isDryRun ? 'DRY RUN (no changes)' : 'LIVE MODE'}\n`);

  const results: RepairResult[] = [];
  let totalIssues = 0;

  // ─── Posts ──────────────────────────────────────────────
  console.log('📝 Scanning posts...');
  const posts = await prisma.post.findMany({ take: 1000 });
  for (const post of posts) {
    const fields: [string, string | null][] = [
      ['title', post.title],
      ['content', post.content],
      ['caption', post.caption],
    ];
    for (const [field, value] of fields) {
      if (!value || !needsRepair(value)) continue;
      const result = await repairField('Post', post.id, field, value, () =>
        prisma.post.update({ where: { id: post.id }, data: { [field]: sanitizeAndNormalize(value) } })
      );
      if (result) { results.push(result); totalIssues += result.issues; }
    }

    // Check buttons JSONB
    if (post.buttons) {
      const jsonStr = JSON.stringify(post.buttons) as string;
      if (needsRepair(jsonStr)) {
        const fixed = sanitizeAndNormalize(jsonStr);
        const result = await repairField('Post', post.id, 'buttons', jsonStr, () =>
          prisma.post.update({ where: { id: post.id }, data: { buttons: JSON.parse(fixed) } })
        );
        if (result) { results.push(result); totalIssues += result.issues; }
      }
    }
  }
  console.log(`   Checked ${posts.length} posts\n`);

  // ─── System Settings ────────────────────────────────────
  console.log('⚙️ Scanning system settings...');
  const settings = await prisma.systemSetting.findMany({ take: 500 });
  for (const s of settings) {
    if (!s.value || typeof s.value !== 'string') continue;
    const val = s.value as string;
    if (!needsRepair(val)) continue;
    const result = await repairField('SystemSetting', s.key, 'value', val, () =>
      prisma.systemSetting.update({ where: { key: s.key }, data: { value: sanitizeAndNormalize(val) } })
    );
    if (result) { results.push(result); totalIssues += result.issues; }
  }
  console.log(`   Checked ${settings.length} settings\n`);

  // ─── Prop Firms ─────────────────────────────────────────
  console.log('🏢 Scanning prop firms...');
  const firms = await prisma.propFirm.findMany({ take: 500 });
  for (const firm of firms) {
    const fields: [string, string | null][] = [
      ['name', firm.name],
      ['description', firm.description],
    ];
    for (const [field, value] of fields) {
      if (!value || !needsRepair(value)) continue;
      const result = await repairField('PropFirm', firm.id, field, value, () =>
        prisma.propFirm.update({ where: { id: firm.id }, data: { [field]: sanitizeAndNormalize(value) } })
      );
      if (result) { results.push(result); totalIssues += result.issues; }
    }
  }
  console.log(`   Checked ${firms.length} prop firms\n`);

  // ─── Admins ─────────────────────────────────────────────
  console.log('👤 Scanning admins...');
  const admins = await prisma.admin.findMany({ take: 200 });
  for (const admin of admins) {
    const fields: [string, string | null][] = [
      ['firstName', admin.firstName],
      ['lastName', admin.lastName],
      ['username', admin.username],
    ];
    for (const [field, value] of fields) {
      if (!value || !needsRepair(value)) continue;
      const result = await repairField('Admin', admin.id, field, value, () =>
        prisma.admin.update({ where: { id: admin.id }, data: { [field]: sanitizeAndNormalize(value) } })
      );
      if (result) { results.push(result); totalIssues += result.issues; }
    }
  }
  console.log(`   Checked ${admins.length} admins\n`);

  // ─── Summary ────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════');
  console.log(`📊 Summary: ${totalIssues} issues in ${results.length} fields across ${new Set(results.map(r => `${r.entity}:${r.id}`)).size} records`);
  if (results.length > 0) {
    console.log('\nDetails:');
    for (const r of results) {
      const action = isDryRun ? 'WOULD FIX' : 'FIXED';
      console.log(`   ${action} ${r.entity}#${r.id}.${r.field} (${r.originalLength}→${r.fixedLength} chars, ${r.issues} issue(s))`);
    }
  } else {
    console.log('✅ No corrupted Unicode found!');
  }
  console.log('═══════════════════════════════════════════════\n');
}

// ─── Helpers ──────────────────────────────────────────────

function needsRepair(text: string): boolean {
  const validation = validateUnicode(text);
  return !validation.valid;
}

function sanitizeAndNormalize(text: string): string {
  return normalizeUnicode(sanitizeUnicode(text));
}

async function repairField(
  entity: string,
  id: number | string,
  field: string,
  original: string,
  updateFn: () => Promise<any>,
): Promise<RepairResult | null> {
  const validation = validateUnicode(original);
  if (validation.valid) return null;

  const fixed = sanitizeAndNormalize(original);
  logUnicodeIssue(`REPAIR_${entity}`, id, original, fixed, `field=${field}`);

  const result: RepairResult = {
    entity,
    id,
    field,
    originalLength: original.length,
    fixedLength: fixed.length,
    issues: validation.issues.length,
  };

  if (!isDryRun) {
    try {
      await updateFn();
    } catch (err) {
      console.error(`   ❌ Failed to fix ${entity}#${id}.${field}:`, err);
      return null;
    }
  }

  return result;
}

main()
  .catch((err) => { console.error('Fatal error:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
