# 🚀 Быстрый старт (5 минут)

Самый быстрый способ запустить систему локально для тестирования.

## Требования

- Node.js 16+ (проверить: `node --version`)
- Python 3.9+ (проверить: `python --version`)
- Git (проверить: `git --version`)

## Установка

### 1️⃣ Клонировать репо
```bash
git clone https://github.com/school21/pool-management.git
cd school21-pool-management
```

### 2️⃣ Backend (в одном терминале)
```bash
cd backend
python -m venv venv
source venv/bin/activate  # или `venv\Scripts\activate` на Windows
pip install -r requirements.txt
python app.py
```

✅ Backend запущен на http://localhost:5000

### 3️⃣ Frontend (в другом терминале)
```bash
cd frontend
npm install
npm start
```

✅ Frontend откроется на http://localhost:3000

## 🎮 Использование

1. **Открыть приложение**: http://localhost:3000
2. **Войти**: введите имя, выберите роль (volunteer/team_lead/admin)
3. **Исследовать**: нажимайте на пункты меню

## 📊 Пример данных

Система поставляется с примерами данных. Для очистки:

```bash
# В backend терминале (Ctrl+C чтобы остановить)
python app.py
# Удалить pool.db и запустить заново
```

## 🆘 Проблемы

### "Port 5000 already in use"
```bash
# Изменить порт в app.py или запустить
python app.py --port 5001
```

### "Module not found"
```bash
pip install -r requirements.txt
```

### "npm ERR!"
```bash
npm cache clean --force
npm install
```

## 📚 Далее

- Читайте [SETUP.md](./SETUP.md) для полной установки
- Смотрите [API документацию](./docs/api.md)
- Прочитайте [TEAM_LEAD_GUIDE.md](./TEAM_LEAD_GUIDE.md)

## ✨ Горячие клавиши

| Клавиша | Действие |
|---------|----------|
| `Ctrl+C` | Остановить сервер |
| `R` | Перезагрузить браузер |
| `F12` | Developer Tools |

---

**Готово!** 🎉 Система работает локально. Для развёртывания смотрите [docs/deployment.md](./docs/deployment.md)
