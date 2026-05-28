

import { Telegraf, Context } from 'telegraf';
import { userService } from '../../services/user.service';
import { discountService } from '../../services/discount.service';
import { lotteryService } from '../../services/lottery.service';
import { cache } from '../../utils/cache';
import {
  mainMenuKeyboard,
  categoryKeyboard,
  paginationKeyboard,
  lotteryKeyboard,
} from '../keyboards';
import { DiscountCategory } from '@prisma/client';
import { logger } from '../../utils/logger';

// ─── تایپ نتایج pagination ────────────────────────────────
interface PaginatedResult<T> {
  items: T[];
  total: number;
  pages: number;
}

// ─── فرمت متن کد تخفیف ────────────────────────────────────
function formatDiscount(d: any, index?: number): string {
  const prefix = index !== undefined ? `${index + 1}. ` : '';

  const expired = d.expiresAt
    ? `\n⏳ انقضا: ${new Date(d.expiresAt).toLocaleDateString('fa-IR')}`
    : '';

  return (
    `${prefix}🏢 *${d.propFirm?.name || 'Unknown'}*\n` +
    `📌 ${d.title}\n` +
    `💸 تخفیف: *${d.discountPercent}%*\n` +
    `🔑 کد: \`${d.code}\`` +
    expired +
    `\n👆 استفاده: ${d.usageCount || 0} بار`
  );
}

export function registerHandlers(bot: Telegraf<Context>) {
  // ─── /start ─────────────────────────────────────────────
  bot.start(async (ctx) => {
    const name = ctx.from?.first_name || 'کاربر';

    await ctx.reply(
      `سلام *${name}* عزیز! 👋\n\n` +
        '🎯 به ربات کدهای تخفیف پراپ فرم خوش آمدید\n\n' +
        'از منوی زیر انتخاب کنید:',
      {
        parse_mode: 'Markdown',
        ...mainMenuKeyboard,
      }
    );
  });

  // ─── کدهای تخفیف ────────────────────────────────────────
  bot.hears('🎯 کدهای تخفیف', async (ctx) => {
    await ctx.reply('یک دسته‌بندی انتخاب کنید:', categoryKeyboard);
  });

  // ─── callback دسته‌بندی ─────────────────────────────────
  bot.action(/^cat:(.+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();

    const category = ctx.match[1] as DiscountCategory | 'ALL';
    const page = 1;

    const result: any =
      category === 'ALL'
        ? await discountService.getAll(page)
        : await discountService.getByCategory(
            category as DiscountCategory,
            page
          );

    if (!result.items || result.items.length === 0) {
      return ctx.editMessageText(
        '❌ در این دسته‌بندی کدی یافت نشد.'
      );
    }

    const text = result.items
      .map((d: any, i: number) => formatDiscount(d, i))
      .join('\n\n─────────\n\n');

    const callbackPrefix = `page:${category}`;

    await ctx.editMessageText(
      `📋 *کدهای تخفیف* (${result.total} کد)\n\n${text}`,
      {
        parse_mode: 'Markdown',
        ...(result.pages > 1
          ? paginationKeyboard(page, result.pages, callbackPrefix)
          : {}),
      }
    );
  });

  // ─── صفحه‌بندی ──────────────────────────────────────────
  bot.action(/^page:(.+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();

    const category = ctx.match[1] as DiscountCategory | 'ALL';
    const page = parseInt(ctx.match[2]);

    const result: any =
      category === 'ALL'
        ? await discountService.getAll(page)
        : await discountService.getByCategory(
            category as DiscountCategory,
            page
          );

    if (!result.items || result.items.length === 0) {
      return ctx.editMessageText('❌ صفحه‌ای یافت نشد.');
    }

    const text = result.items
      .map((d: any, i: number) => formatDiscount(d, i))
      .join('\n\n─────────\n\n');

    const callbackPrefix = `page:${category}`;

    await ctx.editMessageText(
      `📋 *کدهای تخفیف* — صفحه ${page}\n\n${text}`,
      {
        parse_mode: 'Markdown',
        ...paginationKeyboard(page, result.pages, callbackPrefix),
      }
    );
  });

  // ─── کپی کد تخفیف ───────────────────────────────────────
  bot.action(/^copy:(\d+)$/, async (ctx: any) => {
    const id = parseInt(ctx.match[1]);

    const discount = await discountService.getDetails(id);

    if (!discount) {
      return ctx.answerCbQuery('کد یافت نشد');
    }

    // ثبت کلیک و دادن امتیاز
    const user = await userService.getProfile(BigInt(ctx.from.id));

    if (user) {
      await discountService
        .handleClick(id, user.id)
        .catch(logger.error);
    }

    await ctx.answerCbQuery(
      `کد کپی شد: ${discount.code}`,
      {
        show_alert: true,
      }
    );
  });

  // ─── پراپ فرم‌ها ─────────────────────────────────────────
  bot.hears('🏢 پراپ فرم‌ها', async (ctx) => {
    const firms: any[] = await discountService.getPropFirms();

    if (!firms || firms.length === 0) {
      return ctx.reply('❌ هنوز پراپ فرمی ثبت نشده.');
    }

    const text = firms
      .map(
        (f: any) =>
          `🏢 *${f.name}* — ${f._count?.discountCodes || 0} کد تخفیف`
      )
      .join('\n');

    await ctx.reply(`📋 *پراپ فرم‌های موجود:*\n\n${text}`, {
      parse_mode: 'Markdown',
    });
  });

  // ─── جستجو ──────────────────────────────────────────────
  bot.hears('🔍 جستجو', async (ctx) => {
    await ctx.reply('🔍 نام پراپ فرم مورد نظر را بنویسید:');

    cache.set(`search_mode:${ctx.from?.id}`, true, 60);
  });

  bot.on('text', async (ctx: any, next) => {
    const isSearchMode = cache.get<boolean>(
      `search_mode:${ctx.from.id}`
    );

    if (!isSearchMode) {
      return next();
    }

    cache.del(`search_mode:${ctx.from.id}`);

    const query = ctx.message.text;

    const result: any =
      await discountService.search(query);

    if (!result.items || result.items.length === 0) {
      return ctx.reply(
        `❌ نتیجه‌ای برای "*${query}*" یافت نشد.`,
        {
          parse_mode: 'Markdown',
        }
      );
    }

    const text = result.items
      .map((d: any, i: number) => formatDiscount(d, i))
      .join('\n\n─────────\n\n');

    await ctx.reply(
      `🔍 نتایج جستجو برای "*${query}*":\n\n${text}`,
      {
        parse_mode: 'Markdown',
      }
    );
  });

  // ─── قرعه‌کشی ───────────────────────────────────────────
  bot.hears('🎰 قرعه‌کشی', async (ctx) => {
    const lottery: any = await lotteryService.getActiveLottery();

    if (!lottery) {
      const history: any[] = await lotteryService.getHistory();

      if (!history || history.length === 0) {
        return ctx.reply(
          '❌ در حال حاضر قرعه‌کشی فعالی وجود ندارد.'
        );
      }

      const last = history[0];

      const winners = last.entries
        ?.filter((e: any) => e.isWinner)
        ?.map((e: any) => e.user.firstName)
        ?.join('، ');

      return ctx.reply(
        `❌ قرعه‌کشی فعالی وجود ندارد.\n\n🏆 آخرین برنده: ${winners}`
      );
    }

    const userId = (
      await userService.getProfile(BigInt(ctx.from.id))
    )?.id;

    const hasEntered = userId
      ? await lotteryService
          .enterLottery(BigInt(ctx.from.id), lottery.id)
          .then(() => false)
          .catch(() => true)
      : false;

    const endDate = new Date(lottery.endAt).toLocaleDateString(
      'fa-IR'
    );

    await ctx.reply(
      `🎰 *${lottery.title}*\n\n` +
        `🏆 جایزه: ${lottery.prize}\n` +
        `👥 شرکت‌کنندگان: ${lottery._count?.entries || 0} نفر\n` +
        `⭐️ حداقل امتیاز: ${lottery.minPoints}\n` +
        `⏳ پایان: ${endDate}`,
      {
        parse_mode: 'Markdown',
        ...lotteryKeyboard(lottery.id, hasEntered),
      }
    );
  });

  bot.action(/^lottery:enter:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();

    const lotteryId = parseInt(ctx.match[1]);

    const result = await lotteryService.enterLottery(
      BigInt(ctx.from.id),
      lotteryId
    );

    await ctx.reply(result.message);
  });

  // ─── امتیاز من ───────────────────────────────────────────
  bot.hears('⭐️ امتیاز من', async (ctx) => {
    const profile: any = await userService.getProfile(
      BigInt(ctx.from.id)
    );

    if (!profile) {
      return ctx.reply('❌ خطا در دریافت اطلاعات');
    }

    await ctx.reply(
      `👤 *پروفایل شما*\n\n` +
        `🏅 امتیاز: *${profile.points}*\n` +
        `🏆 رتبه: *${profile.rank}*\n` +
        `👥 دعوت‌شدگان: *${profile.totalReferrals}* نفر`,
      {
        parse_mode: 'Markdown',
      }
    );
  });

  // ─── لیدربورد ────────────────────────────────────────────
  bot.hears('🏆 لیدربورد', async (ctx) => {
    const board: any[] = await userService.getLeaderboard();

    const medals = ['🥇', '🥈', '🥉'];

    const text = board
      .map(
        (u: any, i: number) =>
          `${medals[i] || `${i + 1}.`} ${u.firstName} — ${u.points} امتیاز`
      )
      .join('\n');

    await ctx.reply(`🏆 *برترین کاربران:*\n\n${text}`, {
      parse_mode: 'Markdown',
    });
  });

  // ─── دعوت دوستان ────────────────────────────────────────
  bot.hears('👥 دعوت دوستان', async (ctx) => {
    const botInfo = await bot.telegram.getMe();

    const profile: any = await userService.getProfile(
      BigInt(ctx.from.id)
    );

    if (!profile) {
      return;
    }

    const link = await userService.getReferralLink(
      profile.id,
      botInfo.username || ''
    );

    await ctx.reply(
      `👥 *لینک دعوت اختصاصی شما:*\n\n` +
        `${link}\n\n` +
        `✅ به ازای هر دوستی که دعوت کنید *۵۰ امتیاز* دریافت می‌کنید\n` +
        `👤 دعوت‌شدگان تا کنون: ${profile.totalReferrals} نفر`,
      {
        parse_mode: 'Markdown',
      }
    );
  });

  // ─── بررسی عضویت ────────────────────────────────────────
  bot.action('check:membership', async (ctx) => {
    cache.del(`membership:${ctx.from?.id}`);

    await ctx.answerCbQuery('در حال بررسی...');

    await ctx.reply(
      '✅ عضویت شما بررسی شد. حالا /start بزنید.'
    );
  });

  // ─── noop ───────────────────────────────────────────────
  bot.action('noop', async (ctx) => {
    await ctx.answerCbQuery();
  });

  logger.info('✅ تمام هندلرهای ربات ثبت شدند');
}

