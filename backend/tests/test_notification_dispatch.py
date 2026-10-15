import json
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from sqlalchemy.exc import ProgrammingError

import app as app_module


@pytest.fixture()
def dispatch_db(monkeypatch, isolated_db):
    """Keep dispatch SQL isolated from the test DB and all external services."""
    database = SimpleNamespace(
        engine=SimpleNamespace(dialect=SimpleNamespace(name='postgresql')),
        session=Mock(),
        text=app_module.db.text,
    )
    database.session.execute.return_value.scalar.return_value = 314
    monkeypatch.setenv('VERCEL', '1')
    monkeypatch.setattr(app_module, '_telegram_is_configured', lambda: True)
    monkeypatch.setattr(app_module, 'INTERNAL_API_SECRET', 'dispatch-test-secret')
    monkeypatch.setattr(
        app_module, 'NOTIFICATION_DISPATCH_URL', 'https://dispatch.example.test/api'
    )
    with monkeypatch.context() as patch:
        patch.setattr(app_module, 'db', database)
        yield database


@pytest.mark.parametrize('vercel', [None, '0', 'false'])
def test_vm_postgres_dispatch_uses_existing_timer(dispatch_db, monkeypatch, vercel):
    if vercel is None:
        monkeypatch.delenv('VERCEL', raising=False)
    else:
        monkeypatch.setenv('VERCEL', vercel)
    monkeypatch.setenv('FLASK_ENV', 'production')

    assert app_module.queue_notification_dispatch([SimpleNamespace(id=7)]) is None

    dispatch_db.session.execute.assert_not_called()
    dispatch_db.session.commit.assert_not_called()
    dispatch_db.session.rollback.assert_not_called()


def test_legacy_serverless_dispatch_preserves_payload_and_commit(dispatch_db):
    result = app_module.queue_notification_dispatch([
        SimpleNamespace(id=9), SimpleNamespace(id=4), SimpleNamespace(id=9),
        None, SimpleNamespace(id=None),
    ])

    assert result == 314
    statement, parameters = dispatch_db.session.execute.call_args.args
    assert 'net.http_post' in str(statement)
    assert parameters == {
        'url': 'https://dispatch.example.test/api',
        'body': json.dumps({'event_ids': [4, 9]}),
        'headers': json.dumps({
            'Authorization': 'Bearer dispatch-test-secret',
            'Content-Type': 'application/json',
        }),
        'timeout_ms': app_module.NOTIFICATION_DISPATCH_TIMEOUT_MS,
    }
    dispatch_db.session.commit.assert_called_once_with()
    dispatch_db.session.rollback.assert_not_called()


def test_dispatch_failure_rolls_back_without_logging_sql_parameters(dispatch_db, caplog):
    dispatch_db.session.execute.side_effect = ProgrammingError(
        'SELECT private_schema.private_function(%(headers)s)',
        {'headers': 'Bearer dispatch-test-secret', 'event_ids': [987654]},
        RuntimeError('private database diagnostic'),
    )

    with caplog.at_level('WARNING', logger=app_module.app.logger.name):
        assert app_module.queue_notification_dispatch([SimpleNamespace(id=7)]) is None

    dispatch_db.session.rollback.assert_called_once_with()
    dispatch_db.session.commit.assert_not_called()
    assert [record.getMessage() for record in caplog.records] == [
        'Could not queue immediate Telegram dispatch (ProgrammingError)'
    ]
    assert all(record.exc_info is None for record in caplog.records)
    for private_value in (
        'private_schema', 'private_function', 'headers', 'dispatch-test-secret',
        '987654', 'private database diagnostic',
    ):
        assert private_value not in caplog.text


@pytest.mark.parametrize('guard', ['no_ids', 'telegram', 'secret', 'url', 'sqlite'])
def test_legacy_dispatch_configuration_guards(dispatch_db, monkeypatch, guard):
    events = [SimpleNamespace(id=7)]
    if guard == 'no_ids':
        events = [None, SimpleNamespace(id=None)]
    elif guard == 'telegram':
        monkeypatch.setattr(app_module, '_telegram_is_configured', lambda: False)
    elif guard == 'secret':
        monkeypatch.setattr(app_module, 'INTERNAL_API_SECRET', '')
    elif guard == 'url':
        monkeypatch.setattr(app_module, 'NOTIFICATION_DISPATCH_URL', '')
    elif guard == 'sqlite':
        dispatch_db.engine.dialect.name = 'sqlite'

    assert app_module.queue_notification_dispatch(events) is None

    dispatch_db.session.execute.assert_not_called()
    dispatch_db.session.commit.assert_not_called()
    dispatch_db.session.rollback.assert_not_called()
