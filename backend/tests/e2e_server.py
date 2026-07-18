import argparse
import importlib
import os
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

from werkzeug.security import generate_password_hash


TEST_DB_PATH = Path(tempfile.gettempdir()) / 'school21-pool-management-e2e.sqlite'

os.environ['SKIP_LOCAL_DOTENV'] = 'true'
os.environ['TESTING'] = 'true'
os.environ['AUTO_INIT_DB'] = 'false'
os.environ['AUTO_START_WORKERS'] = 'false'
os.environ['AUTO_SYNC_TELEGRAM_COMMANDS'] = 'false'
os.environ['DATABASE_URL'] = f'sqlite:///{TEST_DB_PATH}'
os.environ['FRONTEND_URL'] = 'http://localhost:3005,http://127.0.0.1:3005'
os.environ['SECRET_KEY'] = 'e2e-secret-key'
os.environ['INTERNAL_API_SECRET'] = 'e2e-internal-secret'
os.environ['TELEGRAM_BOT_TOKEN'] = ''
os.environ['TELEGRAM_WEBHOOK_SECRET'] = ''

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

app_module = importlib.import_module('app')


def seed_data():
    User = app_module.User
    Pool = app_module.Pool
    PoolVolunteer = app_module.PoolVolunteer
    DashboardNote = app_module.DashboardNote
    ShiftBlock = app_module.ShiftBlock
    Signup = app_module.Signup
    StudentPenalty = app_module.StudentPenalty

    with app_module.app.app_context():
        app_module.db.session.remove()
        app_module.db.drop_all()
        app_module.db.create_all()

        admin = User(
            nick='admin',
            name='Администратор',
            role='admin',
            telegram='@admin_test',
            password_hash=generate_password_hash('secret123'),
            active=True,
        )
        team_lead = User(
            nick='lead',
            name='Тимлид',
            role='team_lead',
            telegram='@lead_test',
            password_hash=generate_password_hash('lead1234'),
            active=True,
        )
        volunteer = User(
            nick='odessabu',
            name='Денис',
            role='volunteer',
            telegram='@DenisSadykov',
            active=True,
        )
        tribe_master = User(
            nick='deer_master',
            name='Трайб-мастер Оленей',
            role='tribe_master',
            telegram='@deer_master',
            tribe='Олени',
            active=True,
        )
        pool = Pool(
            name='E2E Бассейн',
            active=True,
            archived=False,
            start_date=date.today(),
        )

        app_module.db.session.add_all([admin, team_lead, volunteer, tribe_master, pool])
        app_module.db.session.commit()

        app_module.db.session.add_all([
            PoolVolunteer(pool_id=pool.id, user_id=volunteer.id, pool_role='volunteer'),
            PoolVolunteer(pool_id=pool.id, user_id=tribe_master.id, pool_role='tribe_master', tribe='Олени'),
            PoolVolunteer(pool_id=pool.id, user_id=admin.id, pool_role='responsible_admin'),
            PoolVolunteer(pool_id=pool.id, user_id=team_lead.id, pool_role='responsible_team_lead'),
        ])
        app_module.db.session.add(
            DashboardNote(
                author_id=admin.id,
                pool_id=pool.id,
                text='E2E заметка для проверки дашборда',
                is_pinned=True,
                is_highlighted=True,
                is_active=True,
                is_anonymous=False,
            )
        )

        tomorrow = date.today() + timedelta(days=1)
        block = ShiftBlock(
            pool_id=pool.id,
            date=tomorrow,
            time_start='10:00',
            time_end='14:00',
            label='Утро',
        )
        app_module.db.session.add(block)
        app_module.db.session.commit()

        app_module.db.session.add(Signup(block_id=block.id, user_id=volunteer.id))
        app_module.db.session.add(StudentPenalty(
            student_name='completed_student',
            volunteer_id=volunteer.id,
            volunteer_name=volunteer.name,
            hours=2,
            multiplier=1,
            workoff_status='unlocked',
            description='E2E завершённая пенальти',
            date_worked_off=app_module._naive_utcnow(),
            pool_id=pool.id,
        ))
        app_module.db.session.commit()


def main():
    parser = argparse.ArgumentParser(description='Run isolated backend server for Playwright E2E tests.')
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=5052)
    args = parser.parse_args()

    seed_data()
    app_module.app.run(host=args.host, port=args.port, debug=False, use_reloader=False)


if __name__ == '__main__':
    main()
