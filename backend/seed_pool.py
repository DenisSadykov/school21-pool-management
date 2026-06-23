"""Сидирование реального прошедшего бассейна (08-21.06.2026) из Google-таблицы.

Структура разобрана из CSV вкладки графика: для каждого дня — тайм-блоки,
в каждом блоке — записанные волонтёры (один ник = одна запись).
Запуск:  python seed_pool.py
"""
from datetime import date, datetime

from app import app, db, User, Pool, ShiftBlock, Signup

POOL_NAME = 'School21 08.06.2026 NN Pool'
START_DATE = date(2026, 6, 8)

# (дата, время_от, время_до, метка, [ники])
BLOCKS = [
    ('2026-06-08', '09:00', '19:00', '', ['didielsy', 'konnothr', 'elvisedy', 'lenyldes', 'anisaall', 'nieshays', 'annmarma']),
    ('2026-06-08', '19:00', '20:00', '', ['annmarma', 'nieshays']),
    ('2026-06-09', '10:00', '14:00', '', ['nieshays', 'crazyshe', 'poullanc', 'didielsy']),
    ('2026-06-09', '15:00', '19:00', '', ['phaedral', 'elvisedy', 'anneothe', 'edithart']),
    ('2026-06-10', '10:00', '14:00', '', ['edithart', 'mogobroo']),
    ('2026-06-10', '15:00', '19:00', '', ['flourrit', 'jonnelmc']),
    ('2026-06-11', '11:00', '17:00', 'EXAM', ['konnothr', 'annmarma', 'phaedral', 'antaryod', 'varyseli']),
    ('2026-06-12', '10:00', '14:00', '', ['annmarma', 'mitchely']),
    ('2026-06-12', '15:00', '19:00', '', ['tweaksau', 'flourrit']),
    ('2026-06-13', '10:00', '14:00', '', ['didielsy']),
    ('2026-06-13', '15:00', '19:00', '', ['antaryod']),
    ('2026-06-14', '10:00', '14:00', '', ['annmarma']),
    ('2026-06-14', '15:00', '19:00', '', ['nieshays']),
    # неделя 2
    ('2026-06-15', '10:00', '14:00', '', ['annmarma', 'aracelio']),
    ('2026-06-15', '15:00', '19:00', '', ['anneothe', 'edithart']),
    ('2026-06-16', '10:00', '14:00', '', ['flourrit', 'elvisedy']),
    ('2026-06-16', '15:00', '19:00', '', ['phaedral', 'didielsy']),
    ('2026-06-17', '10:00', '14:00', '', ['mogobroo', 'edithart']),
    ('2026-06-17', '15:00', '19:00', '', ['edithart', 'didielsy']),
    ('2026-06-18', '11:00', '17:00', 'EXAM', ['mitchely', 'anisaall', 'elvisedy', 'didielsy']),
    ('2026-06-19', '10:00', '14:00', '', ['aracelio', 'crazyshe']),
    ('2026-06-19', '15:00', '19:00', '', ['antaryod', 'mogobroo']),
    ('2026-06-20', '10:00', '14:00', '', ['lenyldes']),
    ('2026-06-20', '15:00', '19:00', '', ['didielsy']),
    ('2026-06-21', '10:00', '14:00', '', ['anneothe']),
    ('2026-06-21', '15:00', '19:00', '', ['annmarma']),
]


def get_or_create_user(nick):
    nick = nick.strip().lower()
    user = User.query.filter(db.func.lower(User.nick) == nick).first()
    if not user:
        user = User(nick=nick, name=nick.capitalize(), role='volunteer')
        db.session.add(user)
        db.session.flush()
    return user


def run():
    with app.app_context():
        # очистить прошлый сид этого бассейна, если был
        pool = Pool.query.filter_by(name=POOL_NAME).first()
        if pool:
            block_ids = [b.id for b in ShiftBlock.query.filter_by(pool_id=pool.id).all()]
            if block_ids:
                Signup.query.filter(Signup.block_id.in_(block_ids)).delete(synchronize_session=False)
            ShiftBlock.query.filter_by(pool_id=pool.id).delete(synchronize_session=False)
        else:
            pool = Pool(name=POOL_NAME, start_date=START_DATE)
            db.session.add(pool)
        Pool.query.update({Pool.active: False})
        pool.active = True
        pool.start_date = START_DATE
        db.session.flush()

        n_blocks = n_signups = 0
        for d, t1, t2, label, nicks in BLOCKS:
            block = ShiftBlock(
                pool_id=pool.id,
                date=datetime.fromisoformat(d).date(),
                time_start=t1,
                time_end=t2,
                label=label,
            )
            db.session.add(block)
            db.session.flush()
            n_blocks += 1
            seen = set()
            for nick in nicks:
                user = get_or_create_user(nick)
                if user.id in seen:
                    continue
                seen.add(user.id)
                db.session.add(Signup(block_id=block.id, user_id=user.id))
                n_signups += 1

        db.session.commit()
        vols = User.query.filter_by(role='volunteer').count()
        print(f'[seed] бассейн "{pool.name}" активен')
        print(f'[seed] тайм-блоков: {n_blocks}, записей: {n_signups}, волонтёров: {vols}')


if __name__ == '__main__':
    run()
