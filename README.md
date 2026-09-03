# Searchlight

یک داشبورد فارسی و راست‌به‌چپ برای تحلیل سئو با داده‌های واقعی Google Search Console.

## قابلیت‌ها

- ورود امن با حساب Google / Gmail و OAuth 2.0
- پشتیبانی واقعی از **چند کاربر هم‌زمان Gmail**؛ هر کاربر داده‌ها و propertyهای خودش را جدا می‌بیند
- دریافت پراپرتی‌هایی که کاربر در Search Console به آن‌ها دسترسی دارد
- نمایش کلیک، ایمپرشن، CTR و میانگین جایگاه
- روند روزانه، عبارت‌های جست‌وجو، صفحات برتر و سهم دستگاه‌ها
- پیشنهادهای عملی سئو بر اساس داده‌ی واقعی همان بازه
- بدون داده‌ی ساختگی؛ اگر API، OAuth یا تنظیمات پایگاه‌داده آماده نباشد، وضعیت واضح به کاربر نمایش داده می‌شود

## معماری چندکاربره و ذخیره‌سازی

نسخه فعلی صرفاً روی یک session در حافظه تکیه نمی‌کند؛ برای نگه‌داری امن حساب کاربران از **PostgreSQL** استفاده می‌شود:

| نیازمندی | پیاده‌سازی |
| --- | --- |
| ذخیره کاربران | جدول `users` + `oauth_accounts` در PostgreSQL |
| Google refresh token | با **AES-256-GCM** و کلید `ENCRYPTION_KEY` رمزنگاری شده و در `oauth_accounts` نگه داشته می‌شود |
| session store پایدار | `connect-pg-simple` روی جدول `session`؛ ماندگار بین ری‌استارت و قابل استفاده روی چند instance |
| جداسازی property و داده‌ها | هر کاربر از توکن رمزنگاری‌شده‌ی خودش خوانده می‌شود؛ لیست propertyها در جدول `user_sites` به تفکیک `user_id` ذخیره می‌شود |

سشن فقط یک `userId` را در خود دارد؛ توکن‌ها هرگز به مرورگر یا session فرستاده نمی‌شوند و همیشه قبل از ذخیره رمزنگاری می‌شوند. اگر access token به‌صورت خودکار تازه شود، نسخه‌ی رمزنگاری‌شده‌ی جدید بلافاصله در دیتابیس نوشته می‌شود.

## پیش‌نیازها

- Node.js 18+
- PostgreSQL 13+ (برای اجرای واقعی چندکاربره)
- یک پروژه در Google Cloud با **Search Console API** فعال و OAuth client از نوع **Web application**

## راه‌اندازی

1. در Google Cloud: **Search Console API** را فعال کنید و یک OAuth client از نوع **Web application** بسازید.
2. در **Authorized redirect URIs** آدرس callback را اضافه کنید (برای اجرای محلی):
   `http://localhost:4173/auth/google/callback`
3. یک پایگاه‌داده بسازید، مثلاً:
   ```sql
   CREATE DATABASE searchlight;
   ```
4. فایل `.env.example` را به `.env` کپی کنید و مقدارها را پر کنید:
   - `GOOGLE_CLIENT_ID` و `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI`
   - `DATABASE_URL` (مثل `postgres://user:password@localhost:5432/searchlight`)
   - `ENCRYPTION_KEY` (تولید با `openssl rand -hex 32`)
   - `SESSION_SECRET` (یک مقدار بلند و تصادفی)
5. وابستگی‌ها را نصب و برنامه را اجرا کنید:
   ```bash
   npm install
   npm run dev
   ```
   Schema دیتابیس به‌صورت خودکار هنگام اجرا اعمال می‌شود (migrationها). برای اجرای دستی migration:
   ```bash
   npm run db:migrate
   npm run db:check   # بررسی آمادگی PostgreSQL، کلید رمزنگاری و OAuth
   ```
6. مرورگر را روی `http://localhost:4173` باز کنید.

## نکات امنیتی

- scope فقط خواندن Search Console است (`webmasters.readonly`)؛ برنامه تغییری در propertyها ایجاد نمی‌کند.
- Google refresh/access token ها با AES-256-GCM رمزنگاری و سپس در PostgreSQL ذخیره می‌شوند؛ هیچ‌وقت به صورت متن ساده یا در session نگه داشته نمی‌شوند.
- هر درخواست داده با توکن همان کاربر احراز می‌شود و propertyها نیز بر اساس همان کاربر بررسی می‌شوند (جداسازی کامل بین کاربران).
- cookie سشن `httpOnly` است و در production با `secure` روی HTTPS فرستاده می‌شود.
- در محیط production مقدار `GOOGLE_REDIRECT_URI` باید دقیقاً با redirect URI ثبت‌شده در Google Cloud و دامنه‌ی deployment یکی باشد.
- کلید `ENCRYPTION_KEY` را محرمانه نگه دارید؛ اگر گم شود، توکن‌های ذخیره‌شده قابل رمزگشایی نیستند و کاربران باید دوباره وارد شوند.
- برای production یک سشن‌استور امن (اینجا PostgreSQL) الزامی است؛ این پروژه به‌صورت پیش‌فرض از همین استفاده می‌کند.

## Migrationها

فایل‌های SQL در پوشه `db/migrations` به ترتیب و یک‌بار اجرا می‌شوند (ردیابی در جدول `schema_migrations`). هر migration جدید را به‌صورت `000N_...sql` اضافه کنید؛ هنگام `npm run dev`، `npm start` یا `npm run db:migrate` خودکار اعمال می‌شود. Migrationها idempotent طراحی شده‌اند (استفاده از `IF NOT EXISTS`).
