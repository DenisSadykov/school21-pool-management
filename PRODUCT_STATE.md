# School21 Pool — Текущее состояние продукта
> Актуально на 2026-06-22. Остальные .md файлы в корне — устаревшие черновики, не доверяй им.

---

## Что это

Веб-приложение для управления бассейном (интенсивом) Школы 21.
Волонтёры записываются на смены через сайт вместо редактирования Google Таблицы.
Сайт — источник правды, таблица — зеркало/резерв (синхронизация одностороняя: сайт → таблица).

---

## Стек

| Слой | Технология | Порт |
|------|-----------|------|
| Backend | Flask 3.x, Python 3.14, SQLite, SQLAlchemy | 5001 |
| Frontend | React 18 (CRA) | 3000 |
| Авторизация | `itsdangerous` Bearer-токен, 30 дней | — |
| Синхронизация | Google Apps Script Web App (webhook) | — |
| База | `backend/pool.db` (SQLite) | — |
| Виртуальное окружение | `backend/.venv` | — |

**Запуск:**
```bash
# Backend
cd backend && source .venv/bin/activate && python app.py

# Frontend (отдельный терминал)
cd frontend && npm start
```

---

## Роли и доступ

| Роль | Логин | Что может |
|------|-------|-----------|
| `volunteer` | только ник | записаться/отписаться со смены |
| `tribe_master` | только ник | то же, что volunteer |
| `team_lead` | ник + пароль | всё выше + управлять блоками, волонтёрами, генерировать расписание |
| `admin` | ник + пароль | всё + управлять пользователями любой роли, сброс БД |

Волонтёр/tribe_master без пароля, но ник должен быть зарегистрирован заранее.
Незарегистрированный ник → ошибка при входе.

**Сидовый админ** (создаётся при старте бэкенда): `admin` / `admin123` (из `.env`).

---

## Файловая структура

```
school21-pool-management/
├── backend/
│   ├── app.py              ← весь бэкенд (один файл)
│   ├── .env                ← конфиги (SECRET_KEY, SYNC_WEBHOOK_URL, ...)
│   ├── .venv/              ← виртуальное окружение
│   ├── pool.db             ← база данных SQLite
│   ├── seed_pool.py        ← импорт реального бассейна 08-21.06.2026
│   ├── seed_volunteers.py  ← импорт 28 волонтёров из вкладки ФИО
│   └── apps_script/
│       ├── Code.gs         ← код Google Apps Script (вставить в таблицу)
│       └── README.md       ← инструкция по деплою Apps Script
├── frontend/
│   ├── src/
│   │   ├── api.js          ← единый клиент API (Bearer-токен, базовый URL)
│   │   ├── App.jsx         ← маршруты: /login, /schedule, /manage, /dashboard
│   │   ├── pages/
│   │   │   ├── Login.jsx       ← вход по нику; пароль появляется для team_lead/admin
│   │   │   ├── Schedule.jsx    ← главный грид смен
│   │   │   ├── Manage.jsx      ← настройка (бассейны, блоки, пользователи)
│   │   │   └── Dashboard.jsx   ← статистика + мои ближайшие смены
│   │   ├── components/
│   │   │   └── Sidebar.jsx     ← боковое меню, роль-зависимое
│   │   └── styles/
│   │       └── Schedule.css    ← стили грида смен
│   └── .env                ← REACT_APP_API_URL=http://localhost:5001
└── PRODUCT_STATE.md        ← этот файл
```

---

## Модели базы данных

### User
```
id, nick (unique), name, role, password_hash, telegram, active, created_at
```

### Pool (бассейн)
```
id, name, start_date, active, created_at
```
Одновременно только один `active=True`.

### ShiftBlock (тайм-блок смены)
```
id, pool_id, date, time_start ("10:00"), time_end ("14:00"), label ("EXAM" | ""), capacity, created_at
```
`capacity=None` → без лимита. `capacity=N` → максимум N записей.

### Signup (запись волонтёра)
```
id, block_id, user_id, created_at
UNIQUE (block_id, user_id)
```

### Student, StudentPenalty
Студенты и штрафы (×2 логика). Есть в коде, UI на стадии черновика.

### SyncOutbox
```
id, entity ("signup"|"penalty"), action ("create"|"delete"), payload (JSON),
status ("pending"|"sent"|"error"), attempts, error, created_at, sent_at
```

---

## API Endpoints (backend/app.py)

### Авторизация
- `POST /api/auth/login` — `{nick, password?}` → `{token, user}`
- `GET /api/auth/me` — текущий пользователь

### Пользователи
- `GET /api/users` — список (team_lead, admin)
- `POST /api/users` — создать: `{nick, name, role, password?}`
- `DELETE /api/users/<id>`

### Бассейны
- `GET /api/pools` — все бассейны
- `GET /api/pools/active` — активный
- `POST /api/pools` — создать: `{name, start_date?}`
- `POST /api/pools/<id>/activate` — сделать активным
- `POST /api/pools/<id>/generate-schedule` — **сгенерировать стандартное расписание**: `{end_date}` → создаёт блоки по шаблону (см. ниже)

### Тайм-блоки
- `GET /api/schedule?pool_id=` — грид: `{pool, days: [{date, blocks: [{id, time_start, time_end, label, capacity, count, volunteers: [{user_id, nick}]}]}]}`
- `POST /api/blocks` — создать блок: `{date, time_start, time_end, label, capacity?, pool_id?}`
- `DELETE /api/blocks/<id>` — удалить блок + все записи на него
- `PATCH /api/blocks/<id>/capacity` — изменить ёмкость: `{delta: ±1}` или `{capacity: N}`

### Запись на смену
- `POST /api/blocks/<id>/signup` — записаться (проверяет capacity)
- `DELETE /api/blocks/<id>/signup?user_id=` — отписаться; team_lead/admin могут снять любого через `?user_id=`

### Статистика
- `GET /api/stats` — `{pool, totalBlocks, volunteers, totalSignups, mySignups}`
- `GET /api/me/shifts` — мои ближайшие смены
- `GET /api/volunteers` — список волонтёров с кол-вом смен

### Синхронизация (admin)
- `GET /api/admin/sync-status`
- `POST /api/admin/sync-now`
- `POST /api/admin/reset` — `{confirm: "RESET"}` — полный сброс БД

---

## Стандартный шаблон расписания

Генерируется через `POST /api/pools/<id>/generate-schedule` с `{end_date}`.

| День | Блоки | Capacity |
|------|-------|----------|
| День открытия (первый день) | 09:00–19:00 | 7 |
| День открытия (вечер) | 19:00–20:00 | 2 |
| Понедельник | 10:00–14:00, 15:00–19:00 | 4 каждый |
| Вторник | 10:00–14:00, 15:00–19:00 | 4 каждый |
| Среда | 10:00–14:00, 15:00–19:00 | 2 каждый |
| Четверг | 11:00–17:00 (EXAM) | 5 |
| Пятница | 10:00–14:00, 15:00–19:00 | 2 каждый |
| Суббота | 10:00–14:00, 15:00–19:00 | 2 каждый |
| Воскресенье | 10:00–14:00, 15:00–19:00 | 2 каждый |

Существующие блоки не удаляются — функция только добавляет новые.

---

## Синхронизация с Google Таблицей

**Архитектура (outbox pattern):**
1. Каждая запись/отписка → строка в `SyncOutbox` (status=pending)
2. Фоновый поток (`sync_worker_loop`) каждые 15 сек отправляет batch в Apps Script
3. Apps Script дописывает строки в вкладку `site_signups` таблицы
4. При успехе → status=sent; при ошибке → status=error, повтор следующего цикла

**Конфиги в `backend/.env`:**
```
SYNC_WEBHOOK_URL=https://script.google.com/macros/s/XXXX/exec
SYNC_SECRET=pool-2026-xyz   # совпадает с SECRET в Code.gs
SYNC_INTERVAL=15            # секунды между попытками
```

**Apps Script:** `backend/apps_script/Code.gs` — вставить в таблицу через Расширения → Apps Script, задеплоить как Web App (доступ: Все).

---

## Сидовые данные

### Реальный бассейн (08-21.06.2026)
```bash
cd backend && python seed_pool.py
```
Создаёт: Pool "School21 08.06.2026 NN Pool", 26 ShiftBlock, 58 Signup, 20 User.
Делает этот бассейн активным.

### 28 волонтёров из вкладки ФИО
```bash
cd backend && python seed_volunteers.py
```
Создаёт/обновляет 28 пользователей (24 volunteer, 4 tribe_master: anisaall, antaryod, varyseli, annmarma).

---

## Что реализовано в UI

### Login (`/login`)
- Поле ника → кнопка «Войти»
- Если сервер говорит что нужен пароль → появляется поле пароля
- При успехе → redirect на `/schedule`

### График смен (`/schedule`)
- Колонки по дням активного бассейна
- Каждый блок: время, метка (EXAM), счётчик `X из Y`, кнопки `−` `+` (только staff)
- Кнопка «Записаться» / «Отписаться» (свои); при заполнении → «Мест нет»
- Staff: кнопка `×` на чипе волонтёра (снять любого), корзина (удалить блок), форма добавить блок в конце колонки

### Настройка (`/manage`, только team_lead/admin)
- **Бассейны**: создать (название + дата начала), список, сделать активным
- **Стандартное расписание**: выбрать дату окончания → сгенерировать блоки по шаблону
- **Тайм-блок вручную**: добавить разовый блок с датой/временем/меткой
- **Волонтёры и роли**: добавить ник (с ролью и паролем для staff), удалить

### Дашборд (`/dashboard`)
- Активный бассейн, мои смены, всего блоков, кол-во волонтёров, всего записей
- Список ближайших моих смен

---

## Известные ограничения / не реализовано

- Telegram-уведомления — не реализованы (в планах)
- Монеты / система наград — убраны из скоупа
- Страница штрафов (StudentPenalty) — модель есть, UI нет
- Страница учеников — модель есть, UI нет
- Роль tribe_master не отличается от volunteer в UI (одинаковые права)
- Dashboard одинаковый для всех ролей (не разделён по роли)

---

## .env (backend)

```env
FLASK_DEBUG=true
PORT=5001
SECRET_KEY=dev-secret-change-in-prod
DATABASE_URL=sqlite:///pool.db
ADMIN_NICK=admin
ADMIN_PASSWORD=admin123
GOOGLE_SHEETS_ID=1abN6RGbWYFyBpt8JPdx1aCBoXCnocmI9FtjeISRsO8s
SYNC_WEBHOOK_URL=https://script.google.com/macros/s/AKfycbxlke0dbAECDCDMhcxm1kLmcsGY2mAIhkWsvFttsih4eEsrvhN0dh3_upz5JWL5cAJx/exec
SYNC_SECRET=pool-2026-xyz
SYNC_INTERVAL=15
FRONTEND_URL=http://localhost:3000
```
