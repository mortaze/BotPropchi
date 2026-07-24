import { Context, Markup } from 'telegraf';
import { aiService } from '../../services/ai.service';
import { prisma } from '../../prisma/client';
import { logger } from '../../utils/logger';
import { fetch as fetchNode } from 'node-fetch'; // if grammY sendRichMessage isn't in Telegraf yet

const OUT_OF_SCOPE_MSG = 
  'من فقط می‌تونم درباره‌ی پراپ‌فرم‌ها و کدهای تخفیفشون کمک کنم 🙂\n' +
  'برای سوالات دیگه از منوی اصلی یا پشتیبانی استفاده کن.';

// Redis-based state or in-memory map. For now, in-memory Map since it's an example logic
export const usersInAIMode = new Set<number>();

export function registerAiHandlers(bot: any) {
  bot.action('enter_ai_mode', async (ctx: Context) => {
    if (!ctx.from) return;
    usersInAIMode.add(ctx.from.id);
    await ctx.reply('سوالت رو درباره پراپ‌فرم‌ها یا کدهای تخفیف بپرس 👇',
      Markup.keyboard([['🔙 بازگشت به منو']]).resize()
    );
  });

  bot.hears('🔙 بازگشت به منو', async (ctx: Context, next: any) => {
    if (!ctx.from) return next();
    if (usersInAIMode.has(ctx.from.id)) {
      usersInAIMode.delete(ctx.from.id);
      await ctx.reply('برگشتی به منوی اصلی.', Markup.removeKeyboard()); // you can restore main menu keyboard here
      return;
    }
    return next();
  });

  // We should hook this into a central text handler, but for demo:
  bot.on('text', async (ctx: Context, next: any) => {
    if (!ctx.from || !ctx.message || !('text' in ctx.message)) return next();
    const text = ctx.message.text;

    if (!usersInAIMode.has(ctx.from.id)) return next();

    // Already handled by hears
    if (text === '🔙 بازگشت به منو') return next();

    await ctx.sendChatAction('typing');
    try {
      const result = await aiService.askAI(text);
      logInteraction(ctx.from.id, text, result);

      if (!result.in_scope) {
        return ctx.reply(OUT_OF_SCOPE_MSG);
      }

      if (result.answer) {
        await ctx.reply(result.answer);
      }

      if (result.comparison_table) {
        await sendComparisonTable(ctx.chat?.id.toString() || '', result.comparison_table);
      }

      for (const firmId of result.matched_firm_ids) {
        const post = await prisma.post.findFirst({
          where: { id: parseInt(firmId, 10) },
        });
        if (post) {
          await sendPost(ctx, post);
        }
      }
    } catch (err: any) {
      logger.error('[AI Handler] Error:', err);
      await ctx.reply(err.message || 'یه مشکلی پیش اومد، لطفاً دوباره امتحان کن.');
    }
  });
}

function buildTableMarkdown(headers: string[], rows: string[][]) {
  const headerRow = `| ${headers.join(' | ')} |`;
  const sepRow = `| ${headers.map(() => '---').join(' | ')} |`;
  const bodyRows = rows.map(r => `| ${r.join(' | ')} |`).join('\n');
  return `${headerRow}\n${sepRow}\n${bodyRows}`;
}

async function sendComparisonTable(chatId: string, table: { headers: string[], rows: string[][] }) {
  const richMarkdown = buildTableMarkdown(table.headers, table.rows);
  const token = process.env.BOT_TOKEN;
  if (!token) return;

  try {
    const res = await global.fetch(`https://api.telegram.org/bot${token}/sendRichMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        rich_message: { markdown: richMarkdown },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      logger.error('[AI Handler] sendRichMessage failed:', text);
    }
  } catch (error) {
    logger.error('[AI Handler] Error sending rich table:', error);
  }
}

async function sendPost(ctx: Context, post: any) {
  try {
    if (post.telegramPayload) {
      const payload = post.telegramPayload as any;
      if (payload.chat_id && payload.message_id) {
        await ctx.telegram.copyMessage(ctx.chat!.id, payload.chat_id, payload.message_id);
        return;
      }
    }
    
    // Fallback simple message
    if (post.content) {
      await ctx.reply(post.content);
    }
  } catch (error) {
    logger.error('[AI Handler] Failed to send related post:', error);
  }
}

function logInteraction(userId: number, question: string, result: any) {
  logger.info(`[AI Interaction] User ${userId} asked: ${question} | Scope: ${result.in_scope}`);
  // In production, we can save this to DB
}
