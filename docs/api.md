# API Документация

Полная документация всех API endpoints системы управления бассейном.

## Base URL

```
http://localhost:5000/api
```

## Endpoints

### Аутентификация

#### Login
```http
POST /auth/login
Content-Type: application/json

{
  "name": "Иван Петров",
  "role": "volunteer"
}
```

**Response (200):**
```json
{
  "id": 1,
  "name": "Иван Петров",
  "role": "volunteer"
}
```

---

### Статистика

#### Get Stats
```http
GET /stats
```

**Response (200):**
```json
{
  "totalShifts": 42,
  "volunteers": 15,
  "upcomingShifts": 8,
  "totalCoins": 150.5
}
```

---

### Смены

#### Get All Shifts
```http
GET /shifts
```

**Response (200):**
```json
[
  {
    "id": 1,
    "date": "2026-06-10",
    "time_start": "10:00",
    "time_end": "14:00",
    "location": "Бассейн",
    "status": "confirmed",
    "volunteers": ["didielsy", "edithart"]
  }
]
```

#### Create Shift
```http
POST /shifts
Content-Type: application/json

{
  "date": "2026-06-10",
  "time_start": "10:00",
  "time_end": "14:00",
  "location": "Бассейн"
}
```

**Response (201):**
```json
{
  "id": 1,
  "message": "Shift created"
}
```

#### Delete Shift
```http
DELETE /shifts/{id}
```

**Response (200):**
```json
{
  "message": "Shift deleted"
}
```

---

### Волонтёры

#### Get All Volunteers
```http
GET /volunteers
```

**Response (200):**
```json
[
  {
    "id": 1,
    "name": "Иван Петров",
    "active": true,
    "shifts_count": 5,
    "coins": 10.5,
    "penalties": 2
  }
]
```

---

### Награды

#### Get All Rewards
```http
GET /rewards
```

**Response (200):**
```json
[
  {
    "id": 1,
    "volunteer_name": "Иван Петров",
    "type": "shift_completed",
    "coins": 1,
    "date": "2026-06-10T14:00:00",
    "notes": "Выполнена смена"
  }
]
```

---

### Синхронизация

#### Sync with Google Sheets
```http
POST /sync
```

**Response (200):**
```json
{
  "message": "Sync started",
  "timestamp": "2026-06-22T10:30:00"
}
```

---

### Экспорт

#### Export Data
```http
GET /export
```

**Response (200):**
```json
{
  "shifts": [1, 2, 3],
  "volunteers": ["Иван", "Мария"],
  "exported_at": "2026-06-22T10:30:00"
}
```

---

### Администрирование

#### Reset Database
```http
POST /admin/reset
```

⚠️ **Внимание:** удалит все данные!

**Response (200):**
```json
{
  "message": "Database reset successfully"
}
```

---

## Коды статуса

| Код | Описание |
|-----|----------|
| 200 | OK - Успешный запрос |
| 201 | Created - Ресурс создан |
| 400 | Bad Request - Ошибка в запросе |
| 404 | Not Found - Ресурс не найден |
| 500 | Server Error - Ошибка сервера |

---

## Ошибки

**Формат ошибки:**
```json
{
  "error": "Описание ошибки"
}
```

---

## Аутентификация

В текущей версии система использует простую аутентификацию по имени. В продакшене рекомендуется добавить:

- JWT токены
- Хэширование паролей
- Refresh tokens
- Rate limiting

---

## Версионирование

Текущая версия API: **v1.0.0**

Планируется добавление `/v2/` endpoints в будущих версиях.
