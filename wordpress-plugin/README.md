# Propchi AI Backend WordPress Plugin

افزونه بک‌اند مرکزی برای معماری:

`Telegram Bot → WordPress REST API → WordPress Database + Gemini AI → Telegram Bot`

## نصب

1. پوشه `wordpress-plugin` را با نام دلخواه (مثلاً `propchi-ai-backend`) در مسیر `wp-content/plugins/` کپی کنید.
2. افزونه **Propchi AI Backend** را فعال کنید.
3. از منوی **Propchi AI** تنظیمات امنیت، Gemini API Keys، پیام‌ها، سرویس‌ها و جدول‌های مجاز را تنظیم کنید.
4. در ربات Node.js متغیرهای محیطی زیر را تنظیم کنید:

```env
WORDPRESS_API_URL=https://example.com/wp-json/propchi/v1/message
WORDPRESS_BOT_API_KEY=...
WORDPRESS_SIGNATURE_SECRET=...
```

## Endpoint

`POST /wp-json/propchi/v1/message`

Headers:

- `x-propchi-bot-key` یا
- `x-propchi-timestamp` + `x-propchi-signature` با HMAC-SHA256 روی `timestamp.body`

Body:

```json
{
  "telegram_id": 123456,
  "message": "قوانین پراپ فرم چیست؟",
  "user_data": { "username": "user" }
}
```

Response:

```json
{ "response": "...", "source": "database|gemini|cache" }
```
