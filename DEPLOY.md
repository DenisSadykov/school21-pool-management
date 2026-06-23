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

## 2. Backend on Render

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
```

Старт:

```text
gunicorn -w 1 -b 0.0.0.0:$PORT wsgi:app
```

## 3. Frontend on Vercel

В `Vercel`:

1. Импортируй репозиторий.
2. Укажи `Root Directory = frontend`.
3. Framework preset: `Create React App`.
4. Добавь env var:

```env
REACT_APP_API_URL=https://your-render-service.onrender.com
```

Для роутинга уже добавлен [frontend/vercel.json](/Users/denissadykov/school21-pool-management/frontend/vercel.json).

## 4. Важно перед продом

- Сейчас схема БД создаётся через `db.create_all()` и sqlite-ветка миграций.
- Для `Postgres` текущее состояние должно подняться, но для дальнейшего роста лучше перевести миграции на `Flask-Migrate`.
- Локальные backup-файлы не являются надёжным постоянным хранилищем на бесплатном хостинге. Это скорее аварийный кэш, чем вечный архив.
