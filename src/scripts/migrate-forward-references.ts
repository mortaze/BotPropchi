import { PrismaClient, PostMessageType } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateForwardReferences() {
  console.log('=== Migration: Convert Post-level forwards to PostMessage references ===\n');

  const posts = await prisma.post.findMany({
    where: { isForwarded: true },
    include: { messages: { orderBy: { order: 'asc' } } },
  });

  console.log(`Found ${posts.length} posts with isForwarded=true\n`);

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const post of posts) {
    const fm = post.forwardMeta as any;
    const chatId = post.forwardSourceChatId ? String(post.forwardSourceChatId) : fm?.originChatId;
    const messageId = post.forwardSourceMessageId ? String(post.forwardSourceMessageId) : fm?.originMessageId;

    if (!chatId || !messageId) {
      console.log(`SKIP  Post #${post.id}: no source chat/message ID available`);
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
      console.log(`SKIP  Post #${post.id}: already has forward reference on message #${firstMsg.id}`);
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

      console.log(`OK    Post #${post.id}: migrated forward reference (chat=${chatId}, msg=${messageId})`);
      migrated++;
    } catch (err: any) {
      console.log(`ERROR Post #${post.id}: ${err.message}`);
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
