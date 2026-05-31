import { KeywordReplyResponseType, Prisma } from '@prisma/client';
import { Context } from 'telegraf';
import { prisma } from '../prisma/client';

export const keywordReplyService = {
  list() {
    return prisma.keywordReply.findMany({ orderBy: { createdAt: 'desc' } });
  },
  create(data: Prisma.KeywordReplyCreateInput) {
    return prisma.keywordReply.create({ data });
  },
  update(id: number, data: Prisma.KeywordReplyUpdateInput) {
    return prisma.keywordReply.update({ where: { id }, data });
  },
  delete(id: number) {
    return prisma.keywordReply.delete({ where: { id } });
  },
  history(limit = 50) {
    return prisma.keywordReplyLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { keywordReply: true, telegramGroup: true },
    });
  },
  async handleGroupText(ctx: Context, telegramGroupId: number) {
    const text = (ctx.message as any)?.text || (ctx.message as any)?.caption;
    if (!text || !ctx.from || !(ctx.message as any)?.message_id) return false;
    const replies = await prisma.keywordReply.findMany({ where: { isActive: true }, orderBy: { createdAt: 'desc' } });
    const match = replies.find((item) => text.toLocaleLowerCase('fa-IR').includes(item.keyword.toLocaleLowerCase('fa-IR')));
    if (!match) return false;

    const options: any = { reply_parameters: { message_id: (ctx.message as any).message_id } };
    if (match.parseMode) options.parse_mode = match.parseMode === 'MARKDOWN' ? 'Markdown' : 'HTML';

    if (match.responseType === KeywordReplyResponseType.PHOTO && match.mediaFileId) {
      await ctx.replyWithPhoto(match.mediaFileId, { ...options, caption: match.response || undefined });
    } else if (match.responseType === KeywordReplyResponseType.DOCUMENT && match.mediaFileId) {
      await ctx.replyWithDocument(match.mediaFileId, { ...options, caption: match.response || undefined });
    } else {
      await ctx.reply(match.response || '', options);
    }

    await prisma.keywordReplyLog.create({
      data: { keywordReplyId: match.id, telegramGroupId, userTelegramId: BigInt(ctx.from.id), messageId: (ctx.message as any).message_id, matchedText: text.slice(0, 500) },
    });
    return true;
  },
};
