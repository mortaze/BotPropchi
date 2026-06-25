import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkPostMessages() {
  const posts = await prisma.post.findMany({
    include: {
      _count: { select: { messages: true } },
    },
    orderBy: { id: 'asc' },
  });

  let total = 0;
  let withMessages = 0;
  let withoutMessages = 0;
  const broken: { id: number; title: string; reason: string }[] = [];

  for (const post of posts) {
    total++;
    const msgCount = post._count.messages;
    if (msgCount > 0) {
      withMessages++;
      continue;
    }
    withoutMessages++;

    const hasContent = !!(post.content || post.contentText || post.caption);
    const hasRawContent = !!(post.rawContent || post.renderedContent);
    const entitiesArr = post.entities as any[] | null;
    const contentEntities = post.contentEntities as any[] | null;
    const payload = post.telegramPayload as any;
    const hasEntities = (Array.isArray(entitiesArr) && entitiesArr.length > 0) ||
      (Array.isArray(contentEntities) && contentEntities.length > 0) ||
      (payload && Array.isArray(payload.entities) && payload.entities.length > 0);

    const reasons: string[] = [];
    if (!hasContent && !hasRawContent) {
      reasons.push('no content/contentText/caption/rawContent');
    } else {
      const textSource = post.content || post.contentText || post.caption || '';
      if (textSource.trim() === '') reasons.push('text is empty/whitespace');
    }
    if (post.status === 'ARCHIVED') reasons.push(`status=ARCHIVED`);
    if (!hasContent && !hasEntities) reasons.push('empty post (no text, no entities)');

    const hasCopyMarker = (post.content || '').includes('[[copy]]');
    if (hasCopyMarker) reasons.push('has [[copy]] markers (multi-msg not migrated)');

    if (reasons.length === 0) reasons.push('has content but no post_messages — needs migration');

    broken.push({
      id: post.id,
      title: (post.title ?? '(no title)').slice(0, 60),
      reason: reasons.join('; '),
    });
  }

  console.log('='.repeat(70));
  console.log('POST-MESSAGES HEALTH CHECK REPORT');
  console.log('='.repeat(70));
  console.log(`Total posts:        ${total}`);
  console.log(`With post_messages: ${withMessages}`);
  console.log(`Without:            ${withoutMessages}`);
  console.log();

  if (broken.length === 0) {
    console.log('All posts have post_messages rows. No migration needed.');
  } else {
    console.log('Posts MISSING post_messages:');
    console.log();
    for (const b of broken) {
      console.log(`  [id=${b.id}] "${b.title}"`);
      console.log(`       reason: ${b.reason}`);
    }
    console.log();
    console.log(`Total posts needing migration: ${broken.length}`);
  }

  await prisma.$disconnect();
}

checkPostMessages().catch((e) => {
  console.error('Health-check failed:', e);
  process.exit(1);
});
