# 🏊 School 21 Pool Management

Система управления бассейном для School 21 с красивым веб-интерфейсом, поддержкой редактирования данных и синхронизацией с Google Sheets.

## ✨ Возможности

- 📅 **Управление сменами** — волонтёры выбирают дежурства, Team Leads их редактируют
- 👥 **Управление волонтёрами** — ведение списка, отслеживание статуса
- 🎮 **Система вознаграждений** — учёт коинов и штрафов
- 📊 **Статистика и отчёты** — аналитика по сменам и волонтёрам
- 🔄 **Синхронизация Google Sheets** — двусторонний обмен данными
- 🎨 **Modern UI** — красивый интерфейс в стилистике School 21

## 🚀 Быстрый старт

### Для волонтёров и Team Leads

1. **Открыть приложение**: перейти по ссылке (будет после развёртывания)
2. **Выбрать смены** (волонтёры) или **управлять данными** (Team Leads)
3. **Изменения синхронизируются** с Google Sheets автоматически

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

```bash
cd backend
source venv/bin/activate
python3 telegram_bot.py
```

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
