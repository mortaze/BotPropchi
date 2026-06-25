import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  try {
    const post = await prisma.post.findUnique({ where: { id: 19 } });
    if (!post) { console.log('POST 19 NOT FOUND'); return; }
    console.log('POST 19 EXISTS');
    console.log('id:', post.id);
    console.log('content:', JSON.stringify(post.content));
    console.log('rawContent:', JSON.stringify(post.rawContent));
    console.log('renderedContent:', post.renderedContent ? post.renderedContent.substring(0, 500) : null);
    console.log('contentText:', JSON.stringify(post.contentText));
    console.log('contentEntities:', JSON.stringify(post.contentEntities));
    console.log('telegramPayload:', JSON.stringify(post.telegramPayload));
    const entities = await prisma.postEntity.findMany({ where: { postId: 19 }, orderBy: { id: 'asc' } });
    console.log('ENTITIES COUNT:', entities.length);
    for (const e of entities) {
      console.log(JSON.stringify(e));
    }
  } catch(e) { console.error('ERROR:', e); }
}
main().then(() => prisma.$disconnect()).catch(e => { console.error(e); process.exit(1); });
