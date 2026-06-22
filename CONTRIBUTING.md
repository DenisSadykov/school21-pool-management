# 🤝 Как внести свой вклад

Спасибо за интерес к проекту! Здесь описано, как можно помочь с разработкой и улучшением системы.

## 🎯 Что можно сделать

- 🐛 Сообщить об ошибках через Issues
- 💡 Предложить новые идеи и функции
- 📖 Улучшить документацию
- 🔧 Исправить баги
- ✨ Добавить новые фичи
- 🎨 Улучшить дизайн интерфейса

## 📋 Процесс

### 1. Fork репозитория

```bash
# Нажать кнопку "Fork" на GitHub
# Клонировать свой форк
git clone https://github.com/your-username/pool-management.git
cd school21-pool-management
```

### 2. Создать ветку для своего изменения

```bash
git checkout -b feature/my-amazing-feature
# или
git checkout -b fix/bug-description
```

Рекомендуемые префиксы:
- `feature/` - новая функция
- `fix/` - исправление ошибки
- `docs/` - улучшение документации
- `refactor/` - рефакторинг без изменения функционала
- `style/` - форматирование, не влияющее на функционал

### 3. Внести изменения

```bash
# Внесите свои изменения
# Тестируйте локально
npm test  # для frontend
pytest    # для backend
```

### 4. Коммитить свои изменения

```bash
git add .
git commit -m "Короткое описание изменений"
```

**Правила для commit messages:**
- Начинать с глагола: "Add", "Fix", "Update", "Remove"
- На английском языке
- Максимум 50 символов в заголовке
- Добавить подробное описание в теле сообщения

**Примеры:**
```
Add volunteer selection modal
Fix shift time validation bug
Update API documentation
Remove unused imports
```

### 5. Push в свой форк

```bash
git push origin feature/my-amazing-feature
```

### 6. Создать Pull Request

1. Перейти на GitHub
2. Нажать "New Pull Request"
3. Выбрать свою ветку
4. Написать описание изменений
5. Нажать "Create Pull Request"

## 📝 Pull Request Template

```markdown
## Описание
Кратко опишите, что вы сделали.

## Тип изменения
- [ ] Баг фикс
- [ ] Новая функция
- [ ] Улучшение
- [ ] Документация

## Как тестировать
Шаги для воспроизведения:
1. ...
2. ...
3. ...

## Чек-лист
- [ ] Код протестирован локально
- [ ] Документация обновлена
- [ ] Нет конфликтов слияния
- [ ] Commits логичны и хорошо описаны
```

## 🧪 Тестирование

### Frontend
```bash
cd frontend
npm test
```

### Backend
```bash
cd backend
python -m pytest
```

## 📐 Стиль кода

### Python (Backend)
- Используйте PEP 8
- Max line length: 100
- Type hints для функций

```python
def get_volunteer_by_id(volunteer_id: int) -> Volunteer:
    """Получить волонтёра по ID."""
    return db.session.query(Volunteer).get(volunteer_id)
```

### JavaScript/React (Frontend)
- Используйте Prettier для форматирования
- Camel case для переменных
- Pascal case для компонентов

```javascript
const getUserShifts = (userId) => {
  // Реализация
};

function VolunteerCard({ volunteer }) {
  return <div>{volunteer.name}</div>;
}
```

## 🚀 Процесс review

1. Вы создаёте Pull Request
2. Maintainers проверяют код
3. Вы отвечаете на комментарии
4. После одобрения PR мержится
5. Ваше имя добавляется в список контрибьюторов! 🎉

## 📚 Полезные ссылки

- [Гайд по GitHub Workflow](https://guides.github.com/introduction/flow/)
- [Как писать хорошие commit messages](https://cbea.ms/git-commit/)
- [Conventional Commits](https://www.conventionalcommits.org/)

## 💬 Вопросы?

- Создайте Issue с вопросом
- Обсудите в комментариях к PR
- Свяжитесь с Team Lead'ом

## 📜 Лицензия

Внося вклад, вы соглашаетесь с тем, что ваш код будет распространяться под MIT лицензией.

---

**Спасибо за участие! 🙏**
