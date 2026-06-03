// prisma/seed.ts
// داده‌های اولیه دیتابیس

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 در حال بارگذاری داده‌های اولیه...');

  // ساخت ادمین اولیه
  const passwordHash = await bcrypt.hash('admin123', 10);
  await prisma.admin.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash,
      role: 'SUPER_ADMIN',
    },
  });
  console.log('✅ ادمین اولیه ساخته شد: admin / admin123');

  // چند پراپ فرم نمونه
  const ftmo = await prisma.propFirm.upsert({
    where: { slug: 'ftmo' },
    update: {},
    create: {
      name: 'FTMO',
      slug: 'ftmo',
      description: 'یکی از معروف‌ترین پراپ فرم‌های جهان',
      websiteUrl: 'https://ftmo.com',
    },
  });

  const mff = await prisma.propFirm.upsert({
    where: { slug: 'my-forex-funds' },
    update: {},
    create: {
      name: 'My Forex Funds',
      slug: 'my-forex-funds',
      websiteUrl: 'https://myforexfunds.com',
    },
  });

  // چند کد تخفیف نمونه
  await prisma.discountCode.upsert({
    where: { code: 'FTMO10' },
    update: {},
    create: {
      title: 'تخفیف ۱۰ درصدی FTMO',
      code: 'FTMO10',
      discountPercent: 10,
      isFeatured: true,
      propFirmId: ftmo.id,
    },
  });

  await prisma.discountCode.upsert({
    where: { code: 'MFF15' },
    update: {},
    create: {
      title: 'تخفیف ۱۵ درصدی اولین خرید',
      code: 'MFF15',
      discountPercent: 15,
      propFirmId: mff.id,
    },
  });

  // یک کانال اجباری نمونه (غیرفعال)
  await prisma.requiredChannel.upsert({
    where: { channelId: '@example_channel' },
    update: {},
    create: {
      channelId: '@example_channel',
      title: 'کانال اصلی',
      inviteLink: 'https://t.me/example_channel',
      isActive: false, // تا وقتی کانال واقعی تنظیم نکردید غیرفعال بماند
    },
  });

  // قرعه‌کشی تستی فعال
  const now = new Date();
  await prisma.lottery.upsert({
    where: { id: 1 },
    update: {},
    create: {
      title: 'قرعه‌کشی تستی Prop Hub',
      description: 'نمونه اولیه برای تست ثبت‌نام، نمایش شرکت‌کنندگان و draw دستی',
      prize: 'اعتبار تستی پراپ فرم',
      startAt: now,
      endAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      winnersCount: 1,
      minPoints: 0,
      entryCost: 0,
      announcementMsg: 'قرعه‌کشی تستی فعال شد.',
    },
  });

  console.log('✅ داده‌های اولیه با موفقیت بارگذاری شدند!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
