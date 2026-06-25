import { PrismaClient, PostMessageParseMode, PostMessageType } from '@prisma/client';

const prisma = new PrismaClient();

function splitLegacyContent(content: string): { text: string; offset: number }[] {
  if (!content || !content.trim()) return [];
  const segments: { text: string; offset: number }[] = [];
  const regex = /\[\[copy\]\](.*?)\[\[\/copy\]\]/gs;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) push(content.slice(lastIndex, match.index), lastIndex);
    const innerOffset = match.index + match[0].indexOf(match[1]);
    push(match[1], innerOffset);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) push(content.slice(lastIndex), lastIndex);
  if (segments.length === 0) push(content, 0);
  return segments;

  function push(raw: string, baseOffset: number) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const leadingWs = raw.length - raw.trimStart().length;
    segments.push({ text: trimmed, offset: baseOffset + leadingWs });
  }
}

function scopedEntities(entities: any, offset: number, length: number): any[] {
  if (!Array.isArray(entities)) return [];
  const end = offset + length;
  return entities.flatMap((e: any) => {
    const entityEnd = e.offset + e.length;
    if (e.offset >= end || entityEnd <= offset) return [];
    const start = Math.max(e.offset, offset);
    const stop = Math.min(entityEnd, end);
    return [{ ...e, offset: start - offset, length: stop - start }];
  });
}

async function main() {
  const posts = await prisma.post.findMany({ include: { messages: true } });
  for (const post of posts) {
    if (post.messages.length > 0) continue;
    const content = post.contentText || post.content || post.caption || '';
    const segments = splitLegacyContent(content);
    if (segments.length === 0 && !post.mediaFileId) continue;
    const sourceEntities = (post.contentEntities as any) || (post.entities as any) || [];
    const rows = segments.length ? segments : [{ text: '', offset: 0 }];
    for (let i = 0; i < rows.length; i++) {
      await prisma.postMessage.create({
        data: {
          postId: post.id,
          order: i,
          messageType: post.mediaFileId && i === 0 ? ((post.mediaType as any) || PostMessageType.document) : PostMessageType.text,
          text: rows[i].text,
          entities: scopedEntities(sourceEntities, rows[i].offset, rows[i].text.length),
          parseMode: PostMessageParseMode.None,
          mediaFileId: i === 0 ? post.mediaFileId : null,
          caption: i === 0 ? post.caption : null,
          captionEntities: [],
          replyMarkup: i === 0 ? post.buttons as any : null,
          delayMs: i === 0 ? 0 : 700,
        },
      });
    }
    console.log(`Migrated post ${post.id}: ${rows.length} message(s)`);
  }
}

main().finally(() => prisma.$disconnect());
