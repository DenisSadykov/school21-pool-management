# Схема данных

## Таблицы и структура данных системы управления бассейном

### 1. Users (Пользователи)

| Поле | Тип | Описание |
|------|-----|---------|
| `id` | INTEGER | Уникальный ID |
| `name` | VARCHAR(100) | Имя пользователя |
| `role` | VARCHAR(20) | Роль: `volunteer`, `team_lead`, `admin` |
| `active` | BOOLEAN | Активность (по умолчанию true) |
| `created_at` | DATETIME | Время создания |

**Пример:**
```json
{
  "id": 1,
  "name": "Иван Петров",
  "role": "volunteer",
  "active": true,
  "created_at": "2026-06-01T10:00:00"
}
```

---

### 2. Shifts (Смены)

| Поле | Тип | Описание |
|------|-----|---------|
| `id` | INTEGER | Уникальный ID |
| `date` | DATE | Дата смены |
| `time_start` | VARCHAR(5) | Время начала (HH:MM) |
| `time_end` | VARCHAR(5) | Время окончания (HH:MM) |
| `location` | VARCHAR(100) | Место проведения |
| `status` | VARCHAR(20) | Статус: `pending`, `confirmed` |
| `volunteers` | TEXT | JSON со списком волонтёров |
| `created_at` | DATETIME | Время создания |

**Пример:**
```json
{
  "id": 1,
  "date": "2026-06-10",
  "time_start": "10:00",
  "time_end": "14:00",
  "location": "Бассейн, корпус A",
  "status": "confirmed",
  "volunteers": ["didielsy", "edithart", "annmarma"],
  "created_at": "2026-06-01T10:00:00"
}
```

---

### 3. Rewards (Награды/Штрафы)

| Поле | Тип | Описание |
|------|-----|---------|
| `id` | INTEGER | Уникальный ID |
| `volunteer_id` | INTEGER | ID волонтёра (FK) |
| `volunteer_name` | VARCHAR(100) | Имя волонтёра |
| `type` | VARCHAR(50) | Тип: `shift_completed`, `late`, `no_show`, `bonus` |
| `coins` | FLOAT | Количество коинов (+/−) |
| `date` | DATETIME | Дата события |
| `notes` | TEXT | Заметки |

**Пример:**
```json
{
  "id": 1,
  "volunteer_id": 1,
  "volunteer_name": "Иван Петров",
  "type": "shift_completed",
  "coins": 1.0,
  "date": "2026-06-10T14:00:00",
  "notes": "Выполнена смена 10:00-14:00"
}
```

---

## Перечисления

### User Roles
- `volunteer` - Волонтёр (может выбирать смены)
- `team_lead` - Тимлид (может редактировать все)
- `admin` - Администратор (полный доступ)

### Shift Status
- `pending` - Ожидание подтверждения
- `confirmed` - Подтверждено

### Reward Types
- `shift_completed` - Смена выполнена (+1)
- `late` - Опоздание (-1)
- `no_show` - Не явился (-2)
- `bonus` - Бонус (+0.5)
- `penalty` - Штраф (-X)

---

## Связи между таблицами

```
Users (1) ─── (∞) Rewards
  │
  └─── Shifts (через volunteers JSON)
```

---

## Индексы

Рекомендуемые индексы для оптимизации:

```sql
CREATE INDEX idx_shifts_date ON shifts(date);
CREATE INDEX idx_shifts_status ON shifts(status);
CREATE INDEX idx_rewards_volunteer ON rewards(volunteer_id);
CREATE INDEX idx_rewards_date ON rewards(date);
CREATE INDEX idx_users_role ON users(role);
```

---

## Миграция из Google Sheets

Данные из текущего Google Sheets:

1. **Лист "shifts"** → таблица `shifts`
2. **Лист "volunteers"** → таблица `users` (role='volunteer')
3. **Лист "reward_calc"** → таблица `rewards`
4. **Лист "tribe_events"** → отдельная таблица (будет добавлена)

---

## Примечания

- Все даты хранятся в UTC
- JSON поля используются для массивов (волонтёры в смене)
- Коины могут быть дробные (0.5, 1.5 и т.д.)
- Имена уникальны в системе (используются как primary key в некоторых местах)
