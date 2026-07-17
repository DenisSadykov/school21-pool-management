from sqlalchemy.pool import NullPool

import app as app_module


def test_vercel_numeric_flag_is_treated_as_production(monkeypatch):
    monkeypatch.setenv('VERCEL', '1')

    assert app_module._is_production_runtime() is True
    assert app_module.should_auto_init_db() is False


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
