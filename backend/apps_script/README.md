# Синхронизация сайт → Google Sheets (без Google Cloud)

Здесь используется **Google Apps Script** — код живёт прямо в твоей таблице,
регистрация в Google Cloud НЕ нужна. Нужен только доступ редактора к таблице.

## Шаги (≈5 минут)

1. Открой таблицу → меню **Расширения → Apps Script**.
2. Удали весь код в `Code.gs` и вставь содержимое [`Code.gs`](./Code.gs).
3. В строке `var SECRET = '...'` впиши любой свой секрет (например `pool-2026-xyz`).
4. Нажми **Развернуть → Новое развёртывание**.
   - Шестерёнка → тип **«Веб-приложение»**.
   - **Запуск от имени:** Я (твой аккаунт).
   - **У кого есть доступ:** Все.
   - **Развернуть**, разреши доступ (Google спросит подтверждение).
5. Скопируй **URL веб-приложения** (`https://script.google.com/macros/s/.../exec`).

## Подключение бэкенда

В `backend/.env` пропиши:

```
SYNC_WEBHOOK_URL=https://script.google.com/macros/s/XXXX/exec
SYNC_SECRET=pool-2026-xyz        # ровно как в Code.gs
```

Перезапусти бэкенд. Дальше всё автоматически: каждая запись на смену и каждый
штраф уходят в таблицу. Появятся служебные вкладки **`site_signups`** и
**`site_penalties`** (скрипт создаёт их сам, твои вкладки не трогает).

В админке также есть кнопка **«Выгрузить в Google Sheets»**. Она отправляет
полный снимок системы и перезаписывает листы с префиксом **`export_`**:
`export_students`, `export_volunteers`, `export_shift_blocks`, `export_signups`,
`export_penalties`, `export_penalty_history`, `export_student_events`,
`export_tribe_events`, `export_group_reviews`, `export_reward_events`,
`export_coins`, `export_action_log` и `export_meta`.

Проверка: открой URL в браузере — должно вернуть
`{"ok":true,"message":"...alive"}`. В приложении: раздел **Админ → Синхронизация**
покажет статус и кнопку «Синхронизировать сейчас».
