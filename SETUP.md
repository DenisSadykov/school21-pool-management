# 🔧 Инструкция по установке и запуску

Инструкция для администраторов и разработчиков по установке и запуску системы.

## 📋 Требования

- Git
- Node.js 16+ и npm
- Python 3.9+
- Google аккаунт (для синхронизации с Sheets)

## 🚀 Установка (для локального запуска)

### 1. Клонирование репозитория

```bash
git clone https://github.com/school21/pool-management.git
cd school21-pool-management
```

### 2. Настройка Backend

```bash
cd backend

# Создание виртуального окружения
python -m venv venv

# Активация (macOS/Linux)
source venv/bin/activate

# Активация (Windows)
venv\Scripts\activate

# Установка зависимостей
pip install -r requirements.txt

# Создание .env файла
cp .env.example .env
```

#### Настройка Google Sheets API

1. Перейти в [Google Cloud Console](https://console.cloud.google.com)
2. Создать новый проект: `school21-pool`
3. Включить Google Sheets API:
   - В поиске найти "Google Sheets API"
   - Нажать "Enable"
4. Создать учётные данные:
   - "Create Credentials" → Service Account
   - Загрузить JSON ключ
   - Сохранить в `backend/google_key.json`
5. Поделиться Google Sheets со служебной учётной записью:
   - Скопировать email из `google_key.json`
   - Открыть Google Sheets
   - Нажать "Поделиться" → вставить email

#### Переменные окружения (.env)

```ini
# Backend
FLASK_ENV=development
FLASK_DEBUG=true
SECRET_KEY=your-secret-key-here

# Database
DATABASE_URL=sqlite:///pool.db

# Google Sheets
GOOGLE_SHEETS_ID=1abN6RGbWYFyBpt8JPdx1aCBoXCnocmI9FtjeISRsO8s
GOOGLE_CREDENTIALS_PATH=./google_key.json

# CORS (для фронтенда)
FRONTEND_URL=http://localhost:3000
```

### 3. Запуск Backend

```bash
cd backend
python app.py
```

Сервер будет доступен на `http://localhost:5000`

### 4. Настройка Frontend

```bash
cd ../frontend

# Установка зависимостей
npm install

# Создание .env файла
cat > .env << EOF
REACT_APP_API_URL=http://localhost:5000
REACT_APP_ENV=development
EOF
```

### 5. Запуск Frontend

```bash
npm start
```

Приложение откроется на `http://localhost:3000`

## ✅ Проверка установки

1. **Backend работает?**
   ```bash
   curl http://localhost:5000/api/health
   # Должно вернуть: {"status": "ok"}
   ```

2. **Frontend загружается?**
   - Откройте браузер: http://localhost:3000
   - Должна загрузиться главная страница

3. **Google Sheets синхронизируется?**
   - На странице нажмите "Синхронизировать"
   - В консоли должны появиться логи синхронизации

## 🐳 Docker (опционально)

```bash
# Создание образов
docker-compose build

# Запуск контейнеров
docker-compose up

# Доступ
# Frontend: http://localhost:3000
# Backend: http://localhost:5000
```

## 📦 Развёртывание в продакшене

### Frontend (Vercel)

```bash
# 1. Создать аккаунт на vercel.com
# 2. Коннектить GitHub репо
# 3. Vercel автоматически:
#    - Установит зависимости
#    - Соберёт проект
#    - Развернёт на CDN
```

### Backend (Railway или Render)

```bash
# 1. Коннектить GitHub репо
# 2. Добавить переменные окружения
# 3. Развернётся автоматически
```

## 🔄 Периодическая синхронизация

### Автоматическая (GitHub Actions)

```bash
# Файл: .github/workflows/sync-sheets.yml
# Синхронизирует каждый час
```

### Ручная

```bash
cd backend
python scripts/sync_sheets.py
```

## 🆘 Решение проблем

### "ModuleNotFoundError: No module named 'flask'"
```bash
pip install -r requirements.txt
```

### "CORS error" при обращении к backend
- Проверьте `FRONTEND_URL` в .env
- Перезагрузите backend

### "Google Sheets API error"
- Проверьте `GOOGLE_CREDENTIALS_PATH`
- Убедитесь, что сервис-аккаунт имеет доступ к Sheets
- Проверьте ID таблицы в `GOOGLE_SHEETS_ID`

### "Port 5000/3000 already in use"
```bash
# Другой порт для backend
python app.py --port 5001

# Или для frontend
PORT=3001 npm start
```

## 📖 Дальнейшие шаги

1. Прочитайте [API документацию](./docs/api.md)
2. Изучите [структуру данных](./data/schema.md)
3. Настройте автосинхронизацию (см. .github/workflows)
4. Добавьте пользователей и волонтёров

## 💡 Советы

- 🔒 Никогда не коммитьте `.env` и `google_key.json`
- 🔄 Регулярно синхронизируйте с Google Sheets
- 📊 Делайте бэкапы базы данных
- 🐛 Проверяйте логи при ошибках: `tail -f backend/logs/app.log`

---

Готово? Поздравляем! 🎉 Система работает и готова к использованию.
