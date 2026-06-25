import { PrismaClient, PostMessageType, PostMessageParseMode } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface ContentSegment {
  text: string;
  offset: number;
}

function splitContentWithOffsets(content: string): ContentSegment[] {
  if (!content || !content.trim()) return [];
  const segments: ContentSegment[] = [];
  const regex = /\[\[copy\]\](.*?)\[\[\/copy\]\]/gs;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const raw = content.slice(lastIndex, match.index);
      const trimmed = raw.trim();
      if (trimmed) {
        const leadingWs = raw.length - raw.trimStart().length;
        segments.push({ text: trimmed, offset: lastIndex + leadingWs });
      }
    }
    const innerRaw = match[1];
    const trimmed = innerRaw.trim();
    if (trimmed) {
      const innerOffset = match.index + match[0].indexOf(match[1]);
      const leadingWs = innerRaw.length - innerRaw.trimStart().length;
      segments.push({ text: trimmed, offset: innerOffset + leadingWs });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    const raw = content.slice(lastIndex);
    const trimmed = raw.trim();
    if (trimmed) {
      const leadingWs = raw.length - raw.trimStart().length;
      segments.push({ text: trimmed, offset: lastIndex + leadingWs });
    }
  }

  if (segments.length === 0 && content.trim()) {
    const trimmed = content.trim();
    const leadingWs = content.length - content.trimStart().length;
    segments.push({ text: trimmed, offset: leadingWs });
  }

  return segments;
}

function extractEntitiesForSegment(
  entities: any[] | null | undefined,
  segmentOffset: number,
  segmentLength: number,
): any[] {
  if (!Array.isArray(entities) || entities.length === 0) return [];
  const segEnd = segmentOffset + segmentLength;
  const adjusted: any[] = [];
  for (const e of entities) {
    const entityEnd = e.offset + e.length;
    if (e.offset < segEnd && entityEnd > segmentOffset) {
      const clampedStart = Math.max(e.offset, segmentOffset);
      const clampedEnd = Math.min(entityEnd, segEnd);
      const newOffset = clampedStart - segmentOffset;
      const newLength = clampedEnd - clampedStart;
      if (newLength > 0) {
        const cleaned: any = {};
        for (const key of Object.keys(e)) {
          if (key === 'offset' || key === 'length') continue;
          cleaned[key] = e[key];
        }
        cleaned.offset = newOffset;
        cleaned.length = newLength;
        adjusted.push(cleaned);
      }
    }
  }
  return adjusted;
}

function extractButtonsForMessage(buttons: any, messageIndex: number): any[] {
  if (!buttons) return [];
  if (!Array.isArray(buttons)) {
    if (buttons.messages && buttons.messages[String(messageIndex)]) {
      return JSON.parse(JSON.stringify(buttons.messages[String(messageIndex)]));
    }
    return [];
  }
  return JSON.parse(JSON.stringify(buttons));
}

async function migratePostMessages() {
  console.log('='.repeat(70));
  console.log('POST-MESSAGES MIGRATION');
  console.log('='.repeat(70));

  const posts = await prisma.post.findMany({
    where: {
      messages: { none: {} },
    },
    orderBy: { id: 'asc' },
  });

  console.log(`Found ${posts.length} posts without post_messages.`);
  if (posts.length === 0) {
    console.log('Nothing to migrate.');
    await prisma.$disconnect();
    return;
  }

  let migrated = 0;
  let skipped = 0;
  const logLines: string[] = [];

  for (const post of posts) {
    const content = post.content || post.contentText || post.caption || '';
    if (!content.trim()) {
      logLines.push(`[SKIP] post=${post.id} "${post.title}" — empty content`);
      skipped++;
      continue;
    }

    const entities = (
      (Array.isArray(post.entities) && post.entities.length > 0) ? post.entities :
      (Array.isArray(post.contentEntities) && post.contentEntities.length > 0) ? post.contentEntities :
      (post.telegramPayload && Array.isArray((post.telegramPayload as any).entities) && (post.telegramPayload as any).entities.length > 0) ? (post.telegramPayload as any).entities :
      []
    ) as any[];

    const buttons = post.buttons;
    const segments = splitContentWithOffsets(content);
    const messageType = (post.mediaFileId && post.mediaType)
      ? (post.mediaType === 'photo' ? PostMessageType.photo : PostMessageType.video)
      : PostMessageType.text;
    const mediaFileId = post.mediaFileId || null;
    const albumMediaIds = post.albumMediaIds ? (post.albumMediaIds as string[]) : null;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const segEntities = extractEntitiesForSegment(entities, seg.offset, seg.text.length);
      const msgButtons = extractButtonsForMessage(buttons, i);
      const isFirst = i === 0;

      await prisma.postMessage.create({
        data: {
          postId: post.id,
          order: i,
          messageType: isFirst && mediaFileId ? messageType : PostMessageType.text,
          text: seg.text,
          entities: segEntities,
          parseMode: PostMessageParseMode.None,
          mediaFileId: isFirst ? mediaFileId : null,
          mediaGroupId: isFirst && albumMediaIds && albumMediaIds.length > 1 ? `migrate-${post.id}` : null,
          caption: isFirst ? (post.caption || null) : null,
          captionEntities: [],
          replyMarkup: msgButtons.length > 0 ? { inline_keyboard: msgButtons } : null,
          delayMs: 0,
        },
      });
    }

    logLines.push(`[MIGRATED] post=${post.id} "${post.title}" → ${segments.length} messages (${segments.map(s => `${s.text.length}ch`).join(', ')})`);
    migrated++;
  }

  console.log();
  for (const line of logLines) {
    console.log(line);
  }
  console.log();
  console.log(`Migrated: ${migrated} posts`);
  console.log(`Skipped:  ${skipped} posts`);

  const reportPath = path.join(process.cwd(), 'logs', 'migrate-post-messages-report.log');
  fs.writeFileSync(reportPath, logLines.join('\n'), 'utf-8');
  console.log(`Report saved to: ${reportPath}`);

  await prisma.$disconnect();
}

migratePostMessages().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
