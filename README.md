# 🏊 School 21 Pool Management

Система управления бассейном для School 21 с веб-интерфейсом, поддержкой редактирования данных и автоматической выгрузкой отчётов в Google Sheets.

## ✨ Возможности

- 📅 **Управление сменами** — волонтёры выбирают дежурства, Team Leads их редактируют
- 👥 **Управление волонтёрами** — ведение списка, отслеживание статуса
- 🎮 **Система вознаграждений** — учёт коинов и штрафов
- 📊 **Статистика и отчёты** — аналитика по сменам и волонтёрам
- 🔄 **Выгрузка в Google Sheets** — платформа заполняет существующий шаблон бассейна
- 🎨 **Modern UI** — красивый интерфейс в стилистике School 21

## 🚀 Быстрый старт

### Для волонтёров и Team Leads

1. **Открыть приложение**: перейти по ссылке (будет после развёртывания)
2. **Выбрать смены** (волонтёры) или **управлять данными** (Team Leads)
3. **Изменения выгружаются** в Google Sheets автоматически

### Для администраторов

Просто скачайте актуальный файл Google Sheets через кнопку в интерфейсе — всё там!

## 📁 Структура проекта

```
school21-pool-management/
├── frontend/          # React приложение (UI)
├── backend/           # Python API
├── docs/              # Документация
├── data/              # Примеры данных и схема
└── scripts/           # Утилиты для синхронизации
```

## 🛠️ Для разработчиков

### Frontend

```bash
cd frontend
npm install
npm start
```

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python3 app.py
```

### Telegram Bot

Для Vercel-режима бот работает через `webhook`, а отправка отложенных уведомлений идет через endpoint-dispatcher.

Основные endpoints:

- `POST /api/telegram/webhook`
- `POST /api/telegram/webhook/register`
- `GET /api/telegram/webhook/info`
- `POST /api/notifications/dispatch`

Если позже backend переедет на Render, можно использовать и polling-режим отдельным процессом. Он использует ту же БД, что и backend.

Для GitHub Actions scheduler используй тот же секрет, что и у backend:
- `INTERNAL_API_SECRET`

```bash
cd backend
source venv/bin/activate
python3 telegram_bot.py
```

### Ежедневная проверка

Для быстрой smoke-проверки без ручного перебора команд:

```bash
./scripts/daily_check.sh
```

Скрипт проверяет:

- production-сборку frontend
- frontend test runner в CI-режиме
- зависимости backend через `pip check`
- компиляцию Python-файлов
- smoke-test backend endpoint `GET /api/health`

Важно: локальные секреты храним только в `backend/.env.local` и `frontend/.env.local`. Эти файлы не должны попадать в git.

### Локальная E2E-проверка

Для проверки реального сценария логина и открытия ключевых экранов без обращения к продовой базе:

```bash
./scripts/e2e_check.sh
```

Скрипт поднимает отдельный backend на SQLite, стартует локальный frontend и запускает Playwright smoke-тесты.

### GitHub Actions

В репозитории есть workflow [`.github/workflows/ci.yml`](./.github/workflows/ci.yml), который:

- на `push` и `pull_request` запускает quality-check
- ежедневно запускает автоматическую проверку проекта
- отдельно прогоняет локальный Playwright smoke-контур

Для безопасного деплоя рекомендуется в GitHub включить required checks для workflow `CI`, чтобы изменения попадали в основную ветку только после зелёных проверок.

## 📚 Документация

- [Гайд для Team Lead](./TEAM_LEAD_GUIDE.md)
- [Инструкция по установке](./SETUP.md)
- [API документация](./docs/api.md)
- [Синхронизация Google Sheets](./docs/google-sheets-sync.md)

## 🎯 Roadmap

- [ ] Базовый интерфейс и API
- [ ] Google Sheets синхронизация
- [ ] Система ролей (волонтёр, Team Lead, админ)
- [ ] Автоматические отчёты
- [ ] Мобильная оптимизация
- [ ] Экспорт данных

## 📝 Лицензия

MIT License — свободное использование, модификация и распространение.

## 👥 Авторы

Created by **тимлид** with love ❤️ for School 21 community.

---

**Контакты**: [ваш email]  
**Вопросы?** Создавайте Issues на GitHub!
