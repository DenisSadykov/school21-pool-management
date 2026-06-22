# 🚀 Развёртывание в продакшене

Инструкции по развёртыванию системы на различные платформы.

## Вариант 1: Vercel + Railway (Рекомендуется)

### 1. Frontend на Vercel (бесплатно)

```bash
# 1. Перейти на vercel.com и создать аккаунт
# 2. Нажать "New Project"
# 3. Выбрать GitHub репо
# 4. Vercel автоматически:
#    - Установит зависимости
#    - Соберёт React приложение
#    - Развернёт на CDN
# 5. Добавить переменные окружения
#    REACT_APP_API_URL=https://api.yourdomain.com
```

### 2. Backend на Railway (бесплатно для начина)

```bash
# 1. Перейти на railway.app
# 2. Создать аккаунт через GitHub
# 3. New Project → GitHub Repo
# 4. Выбрать папку: /backend
# 5. Добавить переменные:
#    - FLASK_ENV=production
#    - SECRET_KEY=генерируем с os.urandom(32)
#    - DATABASE_URL=PostgreSQL (в Railway)
#    - GOOGLE_CREDENTIALS_PATH=/app/google_key.json
# 6. Railway автоматически развернёт
```

**URL API будет:** `https://your-project.railway.app`

## Вариант 2: Docker на собственном сервере

### Требования
- Docker и Docker Compose
- Linux сервер (Ubuntu 20.04+)
- Домен и SSL сертификат

### Установка

```bash
# 1. Клонировать репо
git clone https://github.com/school21/pool-management.git
cd school21-pool-management

# 2. Настроить .env файлы
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 3. Отредактировать .env для продакшена
nano backend/.env
# Изменить:
# - FLASK_ENV=production
# - SECRET_KEY=сгенерировать
# - FRONTEND_URL=https://yourdomain.com

nano frontend/.env
# REACT_APP_API_URL=https://api.yourdomain.com

# 4. Запустить контейнеры
docker-compose up -d

# 5. Проверить логи
docker-compose logs -f
```

### Nginx как Reverse Proxy

```nginx
# /etc/nginx/sites-available/pool-management

upstream backend {
    server 127.0.0.1:5000;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API Backend
    location /api {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # CORS headers
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
    }
}

# HTTP redirect
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

Включить:
```bash
sudo ln -s /etc/nginx/sites-available/pool-management /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Вариант 3: Heroku (требует платежа)

```bash
# 1. Установить Heroku CLI
# 2. Логиниться
heroku login

# 3. Создать приложение
heroku create school21-pool-backend

# 4. Добавить PostgreSQL
heroku addons:create heroku-postgresql:hobby-dev

# 5. Добавить переменные
heroku config:set FLASK_ENV=production
heroku config:set SECRET_KEY=$(python -c 'import os; print(os.urandom(32))')

# 6. Развернуть
git push heroku main
```

## Вариант 4: Render.com (бесплатно)

```bash
# 1. Перейти на render.com
# 2. Создать новый Web Service
# 3. Выбрать GitHub репо
# 4. Настроить:
#    - Build command: pip install -r requirements.txt
#    - Start command: python app.py
#    - Environment: Production
# 5. Добавить переменные
# 6. Deploy!
```

## 📊 Сравнение платформ

| Платформа | Frontend | Backend | БД | Цена | Uptime |
|-----------|----------|---------|----|----|--------|
| Vercel + Railway | ✅ | ✅ | ✅ | Бесплатно | 99.9% |
| Docker | ✅ | ✅ | ✅ | Сервер | Зависит |
| Heroku | ✅ | ✅ | ✅ | $50+ | 99.9% |
| Render.com | ✅ | ✅ | ✅ | $7+ | 99.9% |

## 🔐 Безопасность в продакшене

### Обязательно сделать:

1. **Изменить SECRET_KEY**
```python
import os
SECRET_KEY = os.urandom(32)
```

2. **Включить HTTPS**
```python
# Разрешить HTTPS только
app.config['PREFERRED_URL_SCHEME'] = 'https'
```

3. **Настроить CORS правильно**
```python
CORS(app, resources={
    r"/api/*": {
        "origins": ["https://yourdomain.com"],
        "allow_headers": ["Content-Type"],
    }
})
```

4. **Rate limiting**
```bash
pip install Flask-Limiter
```

5. **Database backup**
```bash
# Daily backup
0 2 * * * pg_dump $DATABASE_URL > backup_$(date +\%Y\%m\%d).sql
```

6. **Логирование**
```python
import logging
logging.basicConfig(filename='app.log', level=logging.INFO)
```

## 📈 Мониторинг

Рекомендуемые инструменты:

- **Uptime**: Uptimerobot, StatusCake
- **Логи**: Sentry, LogRocket
- **Метрики**: New Relic, DataDog
- **Ошибки**: Sentry для отслеживания ошибок

## 🔄 CI/CD Pipeline

GitHub Actions автоматически:
1. Запускает тесты
2. Проверяет качество кода
3. Развертывает на staging
4. После merge → deploy в production

## 📞 Поддержка

Если возникли проблемы:
- Проверьте логи: `docker-compose logs backend`
- Смотрите документацию платформы
- Создайте Issue на GitHub
