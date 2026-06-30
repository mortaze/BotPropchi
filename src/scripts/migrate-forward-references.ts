import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateForwardReferences() {
  console.log('=== Migration: Fix forward references ===\n');

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  const posts = await prisma.post.findMany({
    where: { isForwarded: true },
    include: { messages: { orderBy: { order: 'asc' } } },
  });

  console.log(`Phase 1: ${posts.length} posts with isForwarded=true\n`);

  for (const post of posts) {
    const fm = post.forwardMeta as any;
    const chatId = post.forwardSourceChatId ? String(post.forwardSourceChatId) : fm?.originChatId;
    const messageId = post.forwardSourceMessageId ? String(post.forwardSourceMessageId) : fm?.originMessageId;

    if (!chatId || !messageId) {
      console.log(`SKIP  Post #${post.id}: no source IDs`);
      skipped++;
      continue;
    }

    const forwardSource = {
      chatId,
      messageId,
      sourceType: fm?.type || 'channel',
      sourceTitle: fm?.originName || 'ناشناس',
      sourceUsername: fm?.originUsername || null,
    };

    const firstMsg = post.messages[0];
    if (firstMsg && firstMsg.messageType === ('forward' as any) && firstMsg.forwardSource) {
      console.log(`SKIP  Post #${post.id}: already correct`);
      skipped++;
      continue;
    }

    try {
      if (firstMsg) {
        await prisma.postMessage.update({
          where: { id: firstMsg.id },
          data: {
            messageType: 'forward' as any,
            forwardSource,
            text: null,
            entities: [],
            mediaFileId: null,
            caption: null,
            captionEntities: [],
          },
        });
      } else {
        await prisma.postMessage.create({
          data: {
            postId: post.id,
            order: 0,
            messageType: 'forward' as any,
            forwardSource,
          },
        });
      }
      console.log(`OK    Post #${post.id}: forward reference migrated`);
      migrated++;
    } catch (err: any) {
      console.log(`ERROR Post #${post.id}: ${err.message}`);
      errors++;
    }
  }

  console.log('\nPhase 2: Fix post_messages with text type but forward_source data\n');

  const brokenMessages = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, post_id, message_type, forward_source FROM post_messages WHERE message_type = 'text' AND forward_source IS NOT NULL`
  );

  console.log(`Found ${brokenMessages.length} broken post_messages rows\n`);

  for (const row of brokenMessages) {
    const fs = typeof row.forward_source === 'string' ? JSON.parse(row.forward_source) : row.forward_source;
    if (!fs?.chatId || !fs?.messageId) {
      console.log(`SKIP  Message #${row.id}: forward_source has no valid IDs`);
      skipped++;
      continue;
    }
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE post_messages SET message_type = 'forward'::\"PostMessageType\" WHERE id = $1`,
        row.id,
      );
      console.log(`OK    Message #${row.id}: text→forward`);
      migrated++;
    } catch (err: any) {
      console.log(`ERROR Message #${row.id}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Migrated: ${migrated}`);
  console.log(`Skipped:  ${skipped}`);
  console.log(`Errors:   ${errors}`);
}

migrateForwardReferences()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
