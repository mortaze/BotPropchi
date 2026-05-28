// prisma/seed.ts
// داده‌های اولیه دیتابیس

import { PrismaClient, DiscountCategory } from '@prisma/client';
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
      category: DiscountCategory.MOST_POPULAR,
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
      category: DiscountCategory.FIRST_PURCHASE,
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
      isActive: false, // تا وقتی کانال واقعی تنظیم نکردید غیرفعال بماند
    },
  });

  console.log('✅ داده‌های اولیه با موفقیت بارگذاری شدند!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
