"""Импортировать все волонтёры из вкладки ФИО Google-таблицы."""
from app import app, db, User

VOLUNTEERS = [
    # (имя, ник, роль)
    ('Денис', 'odessabu', 'volunteer'),
    ('Андрей', 'crazyshе', 'volunteer'),
    ('Алена', 'aracelio', 'volunteer'),
    ('Наталья', 'poullanc', 'volunteer'),
    ('Кирилл', 'konnothr', 'volunteer'),
    ('Руслан', 'antaryod', 'tribe_master'),  # проверяющий
    ('Андрей', 'harrahli', 'volunteer'),
    ('Таране', 'claricet', 'volunteer'),
    ('Никита', 'norikogu', 'volunteer'),
    ('Катя', 'mogobroo', 'volunteer'),
    ('Дима', 'didielsy', 'volunteer'),
    ('Егор', 'mitchely', 'volunteer'),
    ('Рома', 'lenyldes', 'volunteer'),
    ('Анна', 'anisaall', 'tribe_master'),  # трайб-мастер Коороны
    ('Рома', 'anneothe', 'volunteer'),
    ('Тимофей', 'flourrit', 'volunteer'),
    ('Денис', 'nieshays', 'volunteer'),
    ('Матвей', 'ottomorm', 'volunteer'),
    ('Владимир', 'delisaro', 'volunteer'),
    ('Андрей', 'edithart', 'volunteer'),
    ('Полина', 'elvisedy', 'volunteer'),
    ('Настя', 'tweaksau', 'volunteer'),
    ('Таня', 'varyseli', 'tribe_master'),  # трайб-мастер Олени
    ('Соня', 'annmarma', 'tribe_master'),  # трайб-мастер Ленты
    ('Даша', 'jonnelmc', 'volunteer'),
    ('Иля', 'phaedral', 'volunteer'),
    ('Ильн', 'magicove', 'volunteer'),
    ('Поликарп', 'crazyshe', 'volunteer'),
]


def run():
    with app.app_context():
        added = 0
        for name, nick, role in VOLUNTEERS:
            nick = nick.strip().lower()
            user = User.query.filter(db.func.lower(User.nick) == nick).first()
            if not user:
                db.session.add(User(nick=nick, name=name, role=role))
                added += 1
            elif user.role == 'volunteer' and role != 'volunteer':
                # обновить роль если она повышена (трайб-мастер)
                user.role = role
                added += 1
        db.session.commit()
        total = User.query.filter_by(role='volunteer').count() + \
                User.query.filter_by(role='tribe_master').count()
        print(f'[seed] волонтёры импортированы: +{added}, всего={total}')


if __name__ == '__main__':
    run()
