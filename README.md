# 🤖 ربات تلگرام پراپ فرم

ربات حرفه‌ای مدیریت کدهای تخفیف پراپ فرم با قابلیت قرعه‌کشی، سیستم امتیاز و رفرال.

---

## 🗂 ساختار پروژه

```
propbot/
├── prisma/
│   ├── schema.prisma       ← مدل دیتابیس
│   └── seed.ts             ← داده‌های اولیه
├── src/
│   ├── index.ts            ← نقطه شروع
│   ├── scheduler.ts        ← زمان‌بند خودکار
│   ├── config/             ← تنظیمات
│   ├── utils/              ← logger، cache
│   ├── prisma/             ← کلاینت دیتابیس
│   ├── repositories/       ← کوئری‌های دیتابیس
│   ├── services/           ← منطق تجاری
│   ├── bot/
│   │   ├── handlers/       ← هندلرهای ربات
│   │   ├── keyboards/      ← صفحه‌کلیدها
│   │   └── middlewares/    ← میانجی‌ها
│   └── api/
│       ├── server.ts       ← Express server
│       ├── routes/         ← مسیرهای API
│       └── middlewares/    ← JWT auth
├── .env.example
├── docker-compose.yml
└── Dockerfile
```

---

## 🚀 راه‌اندازی

### پیش‌نیاز
- Node.js 20+
- PostgreSQL 14+ (یا Docker)

### ۱. کلون و نصب
```bash
git clone <repo>
cd propbot
npm install
```

### ۲. تنظیم متغیرها
```bash
cp .env.example .env
# فایل .env را ویرایش کنید
```

فایل `.env`:
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/propbot"
BOT_TOKEN="توکن_از_BotFather"
ADMIN_TELEGRAM_ID="آیدی_عددی_شما"
JWT_SECRET="یک_رشته_تصادفی_بلند"
PORT=3000
```

### ۳. دیتابیس
```bash
npm run db:push      # ساخت جداول
npm run db:seed      # داده‌های اولیه (ادمین: admin/admin123)
npm run db:studio    # مشاهده دیتابیس در مرورگر
```

### ۴. اجرا
```bash
npm run dev    # حالت توسعه (با hot reload)
npm run build  # ساخت
npm start      # اجرای نهایی
```

---

## 🐳 اجرا با Docker

```bash
# تنظیم .env
cp .env.example .env

# اجرا
docker-compose up -d

# اجرای seed
docker-compose exec bot npx ts-node prisma/seed.ts
```

---

## 📡 API پنل ادمین

### ورود
```http
POST /api/auth/login
{ "username": "admin", "password": "admin123" }
```
→ توکن JWT دریافت کنید

### کدهای تخفیف
```http
GET    /api/discounts          # لیست کدها
POST   /api/discounts          # ایجاد کد جدید
PUT    /api/discounts/:id      # ویرایش
DELETE /api/discounts/:id      # حذف

GET    /api/discounts/prop-firms   # لیست پراپ فرم‌ها
POST   /api/discounts/prop-firms   # ایجاد پراپ فرم
```

### قرعه‌کشی
```http
GET  /api/lotteries            # تاریخچه
POST /api/lotteries            # ایجاد قرعه‌کشی جدید
POST /api/lotteries/:id/draw   # برگزاری قرعه‌کشی
```

### کاربران
```http
GET   /api/users               # لیست کاربران
GET   /api/users/stats         # آمار کلی
PATCH /api/users/:id/block     # بلاک/آنبلاک
POST  /api/users/:id/points    # اعطای امتیاز
```

---

## 🎯 دستورات ربات

| دستور / دکمه | توضیح |
|---|---|
| `/start` | شروع و منوی اصلی |
| 🎯 کدهای تخفیف | مشاهده کدها با دسته‌بندی |
| 🏢 پراپ فرم‌ها | لیست پراپ فرم‌ها |
| 🎰 قرعه‌کشی | شرکت در قرعه‌کشی |
| ⭐️ امتیاز من | پروفایل و رتبه |
| 🏆 لیدربورد | برترین کاربران |
| 👥 دعوت دوستان | لینک رفرال |
| 🔍 جستجو | جستجوی پراپ فرم |

---

## ➕ اضافه کردن فیچر جدید

معماری پروژه به گونه‌ای است که برای هر فیچر جدید فقط کافی است:

1. **Model** جدید به `prisma/schema.prisma` اضافه کنید
2. **Repository** جدید در `src/repositories/` بسازید
3. **Service** جدید در `src/services/` بسازید
4. **Handler** جدید در `src/bot/handlers/` بسازید
5. Handler را در `src/index.ts` ثبت کنید

---

## 🔮 توسعه آینده

- [ ] Mini App تلگرام (React)
- [ ] سیستم VIP
- [ ] اعلان هوشمند
- [ ] پرداخت آنلاین
- [ ] چندزبانه (i18n)
- [ ] سیستم AI

---

## 📝 نکات امنیتی

- رمز `admin123` را فوراً عوض کنید
- `JWT_SECRET` را یک رشته تصادفی ۶۴ کاراکتری بگذارید
- در Production از HTTPS استفاده کنید
- فایل `.env` را هرگز commit نکنید

## 📌 APIهای افزوده‌شده

همه مسیرهای زیر به هدر `Authorization: Bearer <JWT>` نیاز دارند. مسیرهای Owner-only در Backend با RBAC محافظت می‌شوند و فقط نقش `OWNER`/`SUPER_ADMIN` اجازه دسترسی دارد.

### سیستم امتیازدهی

```http
GET   /api/scoring/settings
PATCH /api/scoring/settings
```

بدنه نمونه برای به‌روزرسانی:

```json
{
  "startPoints": 10,
  "channelJoinPoints": 5,
  "futureActivityPoints": 0,
  "dailyActivityPoints": 5,
  "linkClickPoints": 2,
  "referralRewardPoints": 20,
  "welcomeMessageText": "سلام {name} عزیز!",
  "initialPointsMessageText": "🎁 {points} امتیاز اولیه دریافت کردید.",
  "isWelcomeMessageEnabled": true
}
```

نکته: سرویس‌های ربات برای امتیاز شروع، فعالیت روزانه، کلیک لینک خرید و دعوت موفق از همین تنظیمات مرکزی استفاده می‌کنند.

### پراپ فرم‌ها

```http
GET    /api/discounts/prop-firms
POST   /api/discounts/prop-firms
PATCH  /api/discounts/prop-firms/:id
```

فیلدهای قابل ارسال برای ایجاد/ویرایش پراپ فرم:

```json
{
  "name": "Prop Firm",
  "slug": "prop-firm",
  "description": "توضیح اختیاری",
  "logoUrl": "https://example.com/logo.png",
  "websiteUrl": "https://example.com/buy",
  "reviewLink": "https://example.com/review",
  "isActive": true
}
```

اگر `reviewLink` خالی باشد، دکمه «بررسی پراپ» در ربات نمایش داده نمی‌شود.
