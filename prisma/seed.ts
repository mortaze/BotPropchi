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

  // ساخت ادمین mori82
  const mori82Hash = '$2b$10$HiaUOutp1KO/F22fJR5u/OBOlVNF.HyyJ0GtY4/juA0fzoy2eCHg';
  await prisma.admin.upsert({
    where: { username: 'mori82' },
    update: { passwordHash: mori82Hash },
    create: {
      username: 'mori82',
      passwordHash: mori82Hash,
      role: 'ADMIN',
    },
  });
  console.log('✅ ادمین mori82 ساخته شد');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
