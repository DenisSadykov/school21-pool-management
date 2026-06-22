# 🛠️ План разработки (Checklist)

## PHASE 1: BACKEND API 🔧

### Модели данных
- [ ] Обновить `User` модель (telegram_nic, фото)
- [ ] Создать `StudentPenalty` модель (штрафы для учеников)
- [ ] Создать `Event` модель (мероприятия)
- [ ] Добавить поля для Google Sheets синхронизации

### API Endpoints (добавить/обновить)

**Волонтёры:**
- [ ] `GET /api/volunteers/profile` - профиль текущего волонтера
- [ ] `PATCH /api/volunteers/<id>/profile` - обновить профиль
- [ ] `GET /api/volunteers/rating` - рейтинг волонтёров (Team Lead only)

**Смены:**
- [ ] `GET /api/shifts/available` - доступные смены
- [ ] `POST /api/shifts/<id>/select` - выбрать смену
- [ ] `DELETE /api/shifts/<id>/select` - отменить выбор

**Штрафы учеников:**
- [ ] `POST /api/penalties` - добавить штраф ученику
- [ ] `GET /api/penalties` - список штрафов (волонтер видит свои)
- [ ] `PATCH /api/penalties/<id>/workoff-status` - обновить статус отработки

**Мероприятия:**
- [ ] `GET /api/events` - все мероприятия (видит всем)
- [ ] `POST /api/events` - создать мероприятие (трайб-мастер)
- [ ] `PATCH /api/events/<id>` - одобрить/отклонить (Team Lead)

**Google Sheets:**
- [ ] `POST /api/sync/penalties` - синхро штрафов
- [ ] `POST /api/sync/all` - полная синхронизация
- [ ] `GET /api/sync/status` - статус последней синхронизации

---

## PHASE 2: FRONTEND СТРАНИЦЫ 🎨

### Обновить существующие страницы

**Dashboard:**
- [ ] Добавить статистику (смены, коины, штрафы выданные)
- [ ] Если волонтер - показать "Выбрать смену сегодня"

**Shifts:**
- [ ] Показать в виде **календаря с сетками** (день → смены → слоты)
- [ ] Кнопка "Выбрать эту смену"
- [ ] Показать кто ещё дежурит
- [ ] Показать свободные слоты

**Volunteers:**
- [ ] Показать рейтинг (Team Lead only)
- [ ] Подсчёт смен каждого волонтёра

### Новые страницы

**Events (Мероприятия):**
- [ ] Список всех зачтённых мероприятий
- [ ] Фильтр по группе
- [ ] Форма "Добавить мероприятие" (трайб-мастер)
- [ ] Кнопка "Одобрить" (Team Lead)

**Penalties (Штрафы учеников):** ⚡ ВАЖНАЯ СТРАНИЦА
- [ ] **Большая красная кнопка "Добавить штраф"**
- [ ] Форма:
  - Имя ученика (dropdown или поиск)
  - Дата нарушения
  - Описание (опционально)
  - Кнопка "Сохранить"
- [ ] Список штрафов текущего бассейна
- [ ] Статус отработки (не сделал → умножить x2)
- [ ] **REAL-TIME синхронизация с Google Sheets** ✨

**Profile (Мой профиль):**
- [ ] Мои данные (ник, имя, telegram)
- [ ] Загрузить фото
- [ ] Мои коины
- [ ] История моих смен

---

## PHASE 3: GOOGLE SHEETS СИНХРОНИЗАЦИЯ 🔄

### Backend changes

```python
# backend/services/sheets_sync.py

def sync_penalties_realtime(penalty_data):
    """Добавить штраф в Google Sheets сразу (за 1 секунду)"""
    pass

def sync_all_data():
    """Полная синхронизация (каждые 5 минут)"""
    pass

def listen_to_sheets_changes():
    """Слушать изменения в Google Sheets и обновлять БД"""
    pass
```

### Что синхронизировать

```
Google Sheets:
├── shifts
├── volunteers  
├── penalties (ученики)
├── events
└── coins_log
```

---

## PHASE 4: TELEGRAM ИНТЕГРАЦИЯ 📱

### Backend

```python
# backend/services/telegram_bot.py

def send_shift_reminder():
    """
    Каждый день в 18:00 отправить уведомление дежурным на завтра
    """
    pass

def handle_shift_confirmation():
    """
    Пользователь нажимает "Я приду" → отмечается в системе
    """
    pass
```

---

## PHASE 5: ADMIN ФУНКЦИИ ⚙️

### Team Lead может:
- [ ] Создать новый бассейн
- [ ] Загрузить смены (CSV или вручную)
- [ ] Загрузить волонтёров
- [ ] Добавлять коины
- [ ] Одобрять мероприятия

### Admin может:
- [ ] Всё выше
- [ ] Экспорт данных (JSON)
- [ ] Сброс данных (с предупреждением)
- [ ] Управлять Team Leads

---

## PRIORITY (Очередность разработки)

### 🔥 КРИТИЧНО (сразу)
1. **Страница штрафов** (волонтер выдаёт штрафы)
2. **Google Sheets синхронизация** (особенно штрафы)
3. **Страница смен** (календарь + выбор)
4. **Страница мероприятий** (все видят)

### 🟡 ВАЖНО (на этапе 1-2)
5. Telegram уведомления
6. Рейтинг волонтёров
7. Профиль волонтера
8. Admin функции

### 🟢 МОЖНО ПОЗЖЕ
9. Фото профилей
10. Статистика детальная
11. Экспорт отчётов

---

## TIMELINE

**День 1-2:** Phase 1 + Phase 2 (Penalties, Shifts, Events)  
**День 3:** Phase 3 (Google Sheets синхронизация)  
**День 4:** Phase 4 (Telegram)  
**День 5:** Phase 5 (Admin)  
**День 6-7:** Тестирование и доработки  

---

## 📋 ФАЙЛЫ ДЛЯ СОЗДАНИЯ/ИЗМЕНЕНИЯ

### Backend
- [ ] `backend/models.py` - добавить StudentPenalty, Event
- [ ] `backend/routes/penalties.py` - новый файл
- [ ] `backend/routes/events.py` - новый файл
- [ ] `backend/services/sheets_sync.py` - обновить
- [ ] `backend/services/telegram_bot.py` - новый файл

### Frontend
- [ ] `frontend/src/pages/Penalties.jsx` - НОВАЯ
- [ ] `frontend/src/pages/Events.jsx` - НОВАЯ
- [ ] `frontend/src/pages/Profile.jsx` - НОВАЯ
- [ ] `frontend/src/pages/Shifts.jsx` - ОБНОВИТЬ
- [ ] `frontend/src/components/EventForm.jsx` - НОВЫЙ
- [ ] `frontend/src/components/PenaltyForm.jsx` - НОВЫЙ
- [ ] `frontend/src/styles/Penalties.css` - НОВЫЙ
- [ ] `frontend/src/styles/Events.css` - НОВЫЙ

---

## ✅ ГОТОВО!

Давайте начнём с Phase 1! Какую страницу хотите сделать первой?

Рекомендую: **Penalties (Штрафы)** - это самая критичная! 🔥
