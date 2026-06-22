FROM node:18-alpine

WORKDIR /app

# Установка зависимостей
COPY package*.json ./
RUN npm ci

# Копирование кода
COPY . .

# Переменные окружения
ENV REACT_APP_API_URL=http://localhost:5000
ENV REACT_APP_ENV=development
ENV PORT=3000

# Запуск
CMD ["npm", "start"]
