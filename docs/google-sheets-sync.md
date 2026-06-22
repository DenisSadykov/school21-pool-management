# Синхронизация с Google Sheets

Система поддерживает двусторонню синхронизацию с Google Sheets для удобства администраторов и волонтёров.

## 🔄 Как это работает

1. **Данные в базе** ← → **Google Sheets**
2. Все изменения автоматически синхронизируются каждый час
3. Администраторы могут синхронизировать вручную кнопкой "Синхронизировать"

## ⚙️ Настройка

### 1. Создать Service Account в Google Cloud

```bash
# 1. Перейти в Google Cloud Console
https://console.cloud.google.com

# 2. Создать новый проект (если нет)
Project name: "School 21 Pool"

# 3. Включить Google Sheets API
Services → Google Sheets API → Enable

# 4. Создать учётные данные
Credentials → Create Credentials → Service Account

# 5. Скачать JSON ключ
Actions → Create Key → JSON
```

### 2. Поделиться Google Sheets со служебной учётной записью

```bash
# 1. Открыть JSON ключ (google_key.json)
# 2. Скопировать email из поля "client_email"
# 3. Открыть Google Sheets
# 4. Нажать "Поделиться" 
# 5. Вставить email и дать доступ на редактирование
```

### 3. Сохранить ключ в проект

```bash
# В backend папке
cp ~/Downloads/google_key.json ./google_key.json

# Добавить в .env
GOOGLE_CREDENTIALS_PATH=./google_key.json
GOOGLE_SHEETS_ID=1abN6RGbWYFyBpt8JPdx1aCBoXCnocmI9FtjeISRsO8s
```

## 📊 Структура Google Sheets

Таблица должна иметь следующие листы:

### Лист "shifts"
```
| Date | Time Start | Time End | Location | Volunteers | Status |
|------|-----------|----------|----------|-----------|--------|
| 10-06-2026 | 10:00 | 14:00 | Бассейн | didielsy, edithart | Confirmed |
```

### Лист "volunteers"
```
| Name | Role | Active | Shifts | Coins | Penalties |
|------|------|--------|--------|-------|-----------|
| Иван Петров | volunteer | Yes | 5 | 10 | 0 |
```

### Лист "rewards"
```
| Volunteer | Type | Coins | Date | Notes |
|-----------|------|-------|------|-------|
| Иван | shift_completed | 1 | 10-06-2026 | Смена выполнена |
```

## 🔄 Автоматическая синхронизация

### GitHub Actions

Синхронизация запускается автоматически каждый час через GitHub Actions.

**Файл:** `.github/workflows/sync-sheets.yml`

Требуемые secrets в GitHub:
- `GOOGLE_CREDENTIALS` - содержимое google_key.json
- `DATABASE_URL` - URL базы данных

Настройка:
```bash
# 1. Перейти в Settings → Secrets and variables
# 2. Добавить GOOGLE_CREDENTIALS
# 3. Добавить DATABASE_URL
```

## 🖱️ Ручная синхронизация

### Из интерфейса

Нажать кнопку "🔄 Синхронизировать" на главной странице

### Из командной строки

```bash
cd backend
python scripts/sync_sheets.py
```

## 📤 Экспорт данных

Администраторы могут скачать актуальные данные через кнопку "⬇️ Скачать" (экспортирует в JSON)

## ⚠️ Важные моменты

1. **Разрешения**: убедитесь, что Service Account имеет доступ на редактирование Sheets
2. **Лимиты**: Google API имеет лимиты на запросы (~100 в минуту)
3. **Конфликты**: если одновременно редактировать в приложении и Sheets, последнее изменение побеждает
4. **Данные**: никогда не коммитьте google_key.json в GitHub!

## 🔐 Безопасность

- Service Account можно отключить в любой момент
- Доступ ограничен только на редактирование, не на удаление
- Все операции логируются

## 🐛 Решение проблем

### "Google Sheets API error"
```
→ Проверить что API включена в Google Cloud Console
→ Убедиться что Service Account имеет доступ
→ Проверить GOOGLE_CREDENTIALS_PATH в .env
```

### "Request limit exceeded"
```
→ Синхронизация запускается слишком часто
→ Изменить крон: 0 */6 * * * (каждые 6 часов)
```

### "Неправильный формат данных"
```
→ Убедиться что листы имеют правильное имя
→ Проверить что все колонки на месте
→ Смотреть логи: tail -f backend/logs/sync.log
```

## 📚 Документация

- [Google Sheets API Docs](https://developers.google.com/sheets/api)
- [Service Accounts](https://cloud.google.com/iam/docs/service-accounts)
- [GitHub Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
