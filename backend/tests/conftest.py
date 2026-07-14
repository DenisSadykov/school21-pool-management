import importlib
import os
import sys
import tempfile
from pathlib import Path

import pytest
from werkzeug.security import generate_password_hash


TEST_DB_PATH = Path(tempfile.gettempdir()) / 'school21-pool-management-test.sqlite'

os.environ['SKIP_LOCAL_DOTENV'] = 'true'
os.environ['TESTING'] = 'true'
os.environ['AUTO_INIT_DB'] = 'false'
os.environ['AUTO_START_WORKERS'] = 'false'
os.environ['AUTO_SYNC_TELEGRAM_COMMANDS'] = 'false'
os.environ['DATABASE_URL'] = f'sqlite:///{TEST_DB_PATH}'
os.environ['SECRET_KEY'] = 'test-secret-key'
os.environ['INTERNAL_API_SECRET'] = 'test-internal-secret'
os.environ['SYNC_SECRET'] = 'test-sheets-secret'
os.environ['TELEGRAM_BOT_TOKEN'] = ''
os.environ['TELEGRAM_WEBHOOK_SECRET'] = ''

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

app_module = importlib.import_module('app')


@pytest.fixture()
def app():
    return app_module.app


@pytest.fixture(autouse=True)
def isolated_db():
    with app_module.app.app_context():
        app_module.db.session.remove()
        app_module.db.drop_all()
        app_module.db.create_all()
        yield
        app_module.db.session.remove()
        app_module.db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def db_session(app):
    with app.app_context():
        yield app_module.db.session


@pytest.fixture()
def factories(db_session):
    User = app_module.User
    Pool = app_module.Pool
    PoolVolunteer = app_module.PoolVolunteer
    ShiftBlock = app_module.ShiftBlock

    class FactorySet:
        def user(self, nick, role='volunteer', password=None, **kwargs):
            user = User(
                nick=nick,
                name=kwargs.pop('name', nick),
                role=role,
                telegram=kwargs.pop('telegram', None),
                active=kwargs.pop('active', True),
                **kwargs,
            )
            if password:
                user.password_hash = generate_password_hash(password)
            db_session.add(user)
            db_session.commit()
            return user

        def pool(self, name='Pool', active=False, archived=False, **kwargs):
            pool = Pool(name=name, active=active, archived=archived, **kwargs)
            db_session.add(pool)
            db_session.commit()
            return pool

        def assign(self, user, pool, pool_role='volunteer', tribe=None):
            relation = PoolVolunteer(
                pool_id=pool.id,
                user_id=user.id,
                pool_role=pool_role,
                tribe=tribe,
            )
            db_session.add(relation)
            db_session.commit()
            return relation

        def shift_block(self, pool, date_value, start='10:00', end='14:00', label=''):
            block = ShiftBlock(
                pool_id=pool.id,
                date=date_value,
                time_start=start,
                time_end=end,
                label=label,
            )
            db_session.add(block)
            db_session.commit()
            return block

    return FactorySet()


@pytest.fixture()
def auth_headers():
    def build(user):
        token = app_module.make_token(user)
        return {'Authorization': f'Bearer {token}'}

    return build
