import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const replies = await p.autoReply.findMany({ include: { keywords: true }, take: 5 });
  for (const r of replies) {
    console.log('AR id=' + r.id + ' title=' + r.title + ' kw_count=' + r.keywords.length);
    for (const k of r.keywords) console.log('  kw_id=' + k.id + ' text=' + k.keyword + ' arId=' + k.autoReplyId);
  }
  const all = await p.autoReplyKeyword.findMany({ take: 20 });
  console.log('ALL KW count=' + all.length);
  for (const k of all) console.log('  kw_id=' + k.id + ' text=' + k.keyword + ' arId=' + k.autoReplyId);
  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
