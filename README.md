# Searchlight

یک داشبورد فارسی و راست‌به‌چپ برای تحلیل سئو با داده‌های واقعی Google Search Console.

## قابلیت‌ها

- ورود امن با حساب Google / Gmail و OAuth 2.0
- دریافت پراپرتی‌هایی که کاربر در Search Console به آن‌ها دسترسی دارد
- نمایش کلیک، ایمپرشن، CTR و میانگین جایگاه
- روند روزانه، عبارت‌های جست‌وجو، صفحات برتر و سهم دستگاه‌ها
- پیشنهادهای عملی سئو بر اساس داده‌ی واقعی همان بازه
- بدون داده‌ی ساختگی در حالت عادی؛ اگر API یا تنظیمات OAuth آماده نباشد، وضعیت واضح به کاربر نمایش داده می‌شود

## راه‌اندازی

1. در Google Cloud یک پروژه بسازید، **Search Console API** را فعال کنید و از بخش OAuth consent screen یک OAuth client از نوع **Web application** بسازید.
2. در Authorized redirect URIs آدرس callback را اضافه کنید. برای اجرای محلی:

   `http://localhost:4173/auth/google/callback`

3. فایل `.env.example` را به `.env` کپی کنید و `GOOGLE_CLIENT_ID`، `GOOGLE_CLIENT_SECRET` و `SESSION_SECRET` را وارد کنید.
4. وابستگی‌ها را نصب و برنامه را اجرا کنید:

   ```bash
   npm install
   npm run dev
   ```

5. مرورگر را روی `http://localhost:4173` باز کنید.

## نکات امنیتی

- scope خواندن Search Console (`webmasters.readonly`) است و برنامه هیچ تغییری در propertyها ایجاد نمی‌کند.
- توکن‌ها فقط در session سمت سرور نگه‌داری می‌شوند و به مرورگر فرستاده نمی‌شوند.
- برای محیط چندنمونه‌ای یا production، MemoryStore پیش‌فرض `express-session` را با یک session store پایدار و امن جایگزین کنید و HTTPS را اجباری کنید.
- در محیط production مقدار `GOOGLE_REDIRECT_URI` باید دقیقاً با redirect URI ثبت‌شده در Google Cloud و دامنه‌ی deployment یکی باشد.
