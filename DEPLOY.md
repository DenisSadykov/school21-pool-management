# Deploy

Текущий стек для онлайна:

- фронт: `Vercel`
- бэк: `Render`
- база: `Supabase Postgres`

## 1. Supabase

Создай проект в `Supabase` и возьми строку подключения `DATABASE_URL`.

Формат:

```env
DATABASE_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres
```

## 2. Backend on Vercel

Если пока нет возможности поднять `Render`, backend можно держать на `Vercel` как Flask API.

Нужно задать env vars:

```env
SECRET_KEY=...
DATABASE_URL=postgresql://...
ADMIN_NICK=admin
ADMIN_PASSWORD=...
FRONTEND_URL=https://your-frontend.vercel.app
SYNC_WEBHOOK_URL=https://script.google.com/macros/s/.../exec
SYNC_SECRET=pool-2026-xyz
SYNC_INTERVAL=15
AUTO_START_WORKERS=false
BACKUP_DIR=/tmp/school21-pool-backups
BACKUP_INTERVAL=3600
TELEGRAM_BOT_TOKEN=...
TELEGRAM_BOT_USERNAME=school21_pool_bot
TELEGRAM_TEST_MODE=true
TELEGRAM_WEBHOOK_SECRET=...
INTERNAL_API_SECRET=...
TELEGRAM_QUIET_HOURS_START=23
TELEGRAM_QUIET_HOURS_END=7
SCHOOL_RULES_URL=https://applicant.21-school.ru/rules
```

Webhook endpoints:

- `POST /api/telegram/webhook`
- `POST /api/telegram/webhook/register`
- `GET /api/telegram/webhook/info`
- `POST /api/notifications/dispatch`

Важно: на `Vercel Hobby` cron не подходит для частого диспетчинга уведомлений. Поэтому `dispatch` лучше дергать внешним scheduler:

- `Supabase Cron`
- `GitHub Actions schedule`
- любой внешний cron-service

`dispatch` endpoint защищен `INTERNAL_API_SECRET`.

## 3. Backend on Render

В репозитории уже есть [render.yaml](/Users/denissadykov/school21-pool-management/render.yaml).

Нужно задать env vars в `Render`:

```env
SECRET_KEY=...
DATABASE_URL=postgresql://...
ADMIN_NICK=admin
ADMIN_PASSWORD=...
FRONTEND_URL=https://your-frontend.vercel.app
SYNC_WEBHOOK_URL=https://script.google.com/macros/s/.../exec
SYNC_SECRET=pool-2026-xyz
SYNC_INTERVAL=15
AUTO_START_WORKERS=true
BACKUP_DIR=/tmp/school21-pool-backups
BACKUP_INTERVAL=3600
TELEGRAM_BOT_TOKEN=...
TELEGRAM_BOT_USERNAME=school21_pool_bot
TELEGRAM_TEST_MODE=true
TELEGRAM_POLL_INTERVAL=2
TELEGRAM_LONG_POLL_TIMEOUT=20
TELEGRAM_QUIET_HOURS_START=23
TELEGRAM_QUIET_HOURS_END=7
SCHOOL_RULES_URL=https://applicant.21-school.ru/rules
```

Старт:

```text
gunicorn -w 1 -b 0.0.0.0:$PORT wsgi:app
```

## 3.1 Telegram bot worker

Для long polling Telegram-бота нужен отдельный background worker. На serverless-хостинге вроде `Vercel` так запускать нельзя, потому что бот должен жить постоянно.

Старт worker-процесса:

```text
python3 telegram_bot.py
```

## 4. Frontend on Vercel

В `Vercel`:

1. Импортируй репозиторий.
2. Укажи `Root Directory = frontend`.
3. Framework preset: `Create React App`.
4. Добавь env var:

```env
REACT_APP_API_URL=https://your-render-service.onrender.com
```

Для роутинга уже добавлен [frontend/vercel.json](/Users/denissadykov/school21-pool-management/frontend/vercel.json).

## 5. Важно перед продом

- Сейчас схема БД создаётся через `db.create_all()` и sqlite-ветка миграций.
- Для `Postgres` текущее состояние должно подняться, но для дальнейшего роста лучше перевести миграции на `Flask-Migrate`.
- Локальные backup-файлы не являются надёжным постоянным хранилищем на бесплатном хостинге. Это скорее аварийный кэш, чем вечный архив.
