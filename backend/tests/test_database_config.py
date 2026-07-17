from sqlalchemy.pool import NullPool

import app as app_module


def test_vercel_numeric_flag_is_treated_as_production(monkeypatch):
    monkeypatch.setenv('VERCEL', '1')

    assert app_module._is_production_runtime() is True
    assert app_module.should_auto_init_db() is False


def test_auto_init_accepts_numeric_boolean(monkeypatch):
    monkeypatch.setenv('AUTO_INIT_DB', '1')

    assert app_module.should_auto_init_db() is True


def test_serverless_runtime_uses_short_lived_database_connections(monkeypatch):
    monkeypatch.setenv('VERCEL', '1')
    monkeypatch.delenv('SERVERLESS_DB_NULL_POOL', raising=False)
    monkeypatch.setenv('DATABASE_CONNECT_TIMEOUT', '7')

    options = app_module.database_engine_options()

    assert options['poolclass'] is NullPool
    assert options['connect_args']['connect_timeout'] == 7


def test_non_serverless_runtime_keeps_regular_pool(monkeypatch):
    monkeypatch.delenv('VERCEL', raising=False)

    assert app_module.database_engine_options() == {}


def test_serverless_null_pool_can_be_disabled_for_fast_rollback(monkeypatch):
    monkeypatch.setenv('VERCEL', '1')
    monkeypatch.setenv('SERVERLESS_DB_NULL_POOL', 'false')

    assert app_module.database_engine_options() == {}


def test_production_database_guard_accepts_transaction_mode(monkeypatch):
    monkeypatch.setenv('VERCEL', '1')
    monkeypatch.delenv('AUTO_INIT_DB', raising=False)
    monkeypatch.delenv('RUN_SCHEMA_MIGRATIONS', raising=False)
    monkeypatch.delenv('SERVERLESS_DB_NULL_POOL', raising=False)

    status = app_module.production_database_status(
        'postgresql://user:password@pooler.example.com:6543/postgres'
    )

    assert status == {
        'serverless': True,
        'connection_mode': 'transaction',
        'issues': [],
    }


def test_production_database_guard_rejects_session_mode(monkeypatch):
    monkeypatch.setenv('VERCEL', '1')
    monkeypatch.delenv('AUTO_INIT_DB', raising=False)
    monkeypatch.delenv('RUN_SCHEMA_MIGRATIONS', raising=False)
    monkeypatch.delenv('SERVERLESS_DB_NULL_POOL', raising=False)

    status = app_module.production_database_status(
        'postgresql://user:password@pooler.example.com:5432/postgres'
    )

    assert status['connection_mode'] == 'session'
    assert any('5432' in issue for issue in status['issues'])


def test_production_database_guard_rejects_migrations_and_regular_pool(monkeypatch):
    monkeypatch.setenv('VERCEL', '1')
    monkeypatch.setenv('AUTO_INIT_DB', 'true')
    monkeypatch.setenv('RUN_SCHEMA_MIGRATIONS', 'true')
    monkeypatch.setenv('SERVERLESS_DB_NULL_POOL', 'false')

    status = app_module.production_database_status(
        'postgresql://user:password@pooler.example.com:6543/postgres'
    )

    assert len(status['issues']) == 3
    assert any('AUTO_INIT_DB' in issue for issue in status['issues'])
    assert any('RUN_SCHEMA_MIGRATIONS' in issue for issue in status['issues'])
    assert any('SERVERLESS_DB_NULL_POOL' in issue for issue in status['issues'])
