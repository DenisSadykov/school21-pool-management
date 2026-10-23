import json
import traceback
from contextlib import contextmanager

import pytest
import requests
from sqlalchemy import event as sqlalchemy_event

import app as app_module


SYNTHETIC_SECRET = 'SYNTHETIC_BOT_TOKEN_DO_NOT_LEAK_18'
PRIVATE_TEXT = 'SYNTHETIC_PRIVATE_PROVIDER_TEXT_18'
SYNTHETIC_URL = f'https://api.telegram.org/bot{SYNTHETIC_SECRET}/syntheticMethod'


@pytest.fixture(autouse=True)
def isolated_telegram_transport(monkeypatch):
    monkeypatch.setattr(app_module, 'TELEGRAM_BOT_TOKEN', SYNTHETIC_SECRET)

    def no_network(*args, **kwargs):
        pytest.fail('Unexpected network request in isolated Telegram API test')

    monkeypatch.setattr(requests.sessions.Session, 'request', no_network)


@pytest.fixture(params=['GET', 'POST'])
def api_call(request, monkeypatch):
    verb = request.param
    calls = []

    def install(transport):
        def fake_request(url, **kwargs):
            calls.append((url, kwargs))
            return transport()

        monkeypatch.setattr(requests, 'get' if verb == 'GET' else 'post', fake_request)

    def invoke(payload=None):
        wrapper = app_module.telegram_get if verb == 'GET' else app_module.telegram_api
        return wrapper('syntheticMethod', payload)

    return verb, calls, install, invoke


def response_with_payload(payload, status=200):
    response = requests.Response()
    response.status_code = status
    response.url = SYNTHETIC_URL
    response.reason = PRIVATE_TEXT
    response.request = requests.Request('POST', SYNTHETIC_URL, data=PRIVATE_TEXT).prepare()
    response._content = json.dumps(payload).encode('utf-8')
    return response


def assert_safe_exception(exc):
    rendered = ''.join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    for forbidden in (SYNTHETIC_SECRET, SYNTHETIC_URL, PRIVATE_TEXT, 'https://api.telegram.org'):
        assert forbidden not in str(exc)
        assert forbidden not in repr(exc)
        assert forbidden not in rendered


@pytest.mark.parametrize('result', [{'message_id': 12}, True, False, None])
@pytest.mark.parametrize('payload', [None, {'chat_id': 'synthetic-recipient', 'text': PRIVATE_TEXT}])
def test_telegram_success_preserves_results_and_request_arguments(api_call, result, payload):
    verb, calls, install, invoke = api_call
    install(lambda: response_with_payload({'ok': True, 'result': result}))
    assert invoke(payload) == result
    argument_name = 'params' if verb == 'GET' else 'json'
    assert calls == [(SYNTHETIC_URL, {
        'timeout': app_module.TELEGRAM_API_TIMEOUT,
        argument_name: payload or {},
    })]


@pytest.mark.parametrize('status', [400, 401, 403, 429, 500])
def test_http_failure_preserves_only_status_without_sensitive_response(api_call, status):
    _, calls, install, invoke = api_call
    response = response_with_payload({'ok': False, 'description': PRIVATE_TEXT}, status)
    install(lambda: response)
    with pytest.raises(requests.HTTPError) as caught:
        invoke({'text': PRIVATE_TEXT})
    exc = caught.value
    assert_safe_exception(exc)
    assert exc.__suppress_context__ is True
    assert exc.response is not None
    assert exc.response is not response
    assert exc.response.status_code == status
    assert exc.response.url is None
    assert exc.response.request is None
    assert exc.response.text == ''
    assert exc.request is None
    assert str(exc) == f'Telegram API HTTP request failed (HTTP {status})'
    assert len(calls) == 1


@pytest.mark.parametrize('exception_class', [
    requests.Timeout,
    requests.ReadTimeout,
    requests.ConnectTimeout,
    requests.ConnectionError,
    requests.exceptions.SSLError,
    requests.exceptions.ProxyError,
    requests.TooManyRedirects,
    requests.RequestException,
])
def test_transport_failures_preserve_exception_class_without_retry_or_secret(api_call, exception_class):
    _, calls, install, invoke = api_call

    def fail():
        raise exception_class(f'{PRIVATE_TEXT}: {SYNTHETIC_URL}')

    install(fail)
    with pytest.raises(exception_class) as caught:
        invoke()
    exc = caught.value
    assert type(exc) is exception_class
    assert_safe_exception(exc)
    assert exc.__suppress_context__ is True
    assert exc.request is None
    assert exc.response is None
    assert len(calls) == 1


def test_http_failure_without_response_remains_safe_http_error(api_call):
    _, calls, install, invoke = api_call

    def fail():
        raise requests.HTTPError(f'{PRIVATE_TEXT}: {SYNTHETIC_URL}')

    install(fail)
    with pytest.raises(requests.HTTPError) as caught:
        invoke()
    assert_safe_exception(caught.value)
    assert caught.value.response is None
    assert caught.value.request is None
    assert str(caught.value) == 'Telegram API HTTP request failed'
    assert len(calls) == 1


@pytest.mark.parametrize('requests_error', [False, True])
def test_invalid_json_never_exposes_document_or_decoder_error(api_call, requests_error):
    _, calls, install, invoke = api_call
    response = response_with_payload({'ok': True, 'result': {}})

    def invalid_json():
        if requests_error:
            raise requests.exceptions.JSONDecodeError(PRIVATE_TEXT, SYNTHETIC_URL, 0)
        raise ValueError(f'{PRIVATE_TEXT}: {SYNTHETIC_URL}')

    response.json = invalid_json
    install(lambda: response)
    with pytest.raises(RuntimeError, match='Telegram API returned invalid JSON') as caught:
        invoke()
    assert_safe_exception(caught.value)
    assert caught.value.__suppress_context__ is True
    assert len(calls) == 1


@pytest.mark.parametrize('payload', [
    None,
    [],
    [PRIVATE_TEXT],
    PRIVATE_TEXT,
    42,
    {},
    {'ok': PRIVATE_TEXT, 'description': SYNTHETIC_URL},
    {'ok': 1, 'result': SYNTHETIC_URL},
    {'ok': None, 'result': PRIVATE_TEXT},
    {'ok': True, 'description': PRIVATE_TEXT},
])
def test_malformed_payload_fails_safely(api_call, payload):
    _, calls, install, invoke = api_call
    install(lambda: response_with_payload(payload))
    with pytest.raises(RuntimeError, match='Telegram API returned an invalid response') as caught:
        invoke()
    assert_safe_exception(caught.value)
    assert len(calls) == 1


@pytest.mark.parametrize('error_code', [400, 429, PRIVATE_TEXT])
def test_api_declared_failure_never_exposes_provider_payload(api_call, error_code):
    _, calls, install, invoke = api_call
    install(lambda: response_with_payload({
        'ok': False,
        'description': PRIVATE_TEXT + SYNTHETIC_URL,
        'error_code': error_code,
        'parameters': {'retry_after': PRIVATE_TEXT},
    }))
    with pytest.raises(RuntimeError, match='Telegram API reported failure') as caught:
        invoke()
    assert_safe_exception(caught.value)
    assert len(calls) == 1


def test_unconfigured_api_never_attempts_transport(api_call, monkeypatch):
    _, calls, _, invoke = api_call
    monkeypatch.setattr(app_module, 'TELEGRAM_BOT_TOKEN', '')
    with pytest.raises(RuntimeError, match='TELEGRAM_BOT_TOKEN не задан'):
        invoke()
    assert calls == []


def test_failed_dispatch_stores_only_safe_error_and_preserves_retry(
        factories, db_session, monkeypatch):
    admin = factories.user('synthetic-telegram-error-admin', role='admin')
    pool = factories.pool('Synthetic Telegram error pool', active=True)
    factories.assign(admin, pool, pool_role='responsible_admin')
    event = app_module.NotificationEvent(
        type='penalty_admin_block', priority='urgent', status='queued',
        recipient_user_id=admin.id, pool_id=pool.id,
        payload=json.dumps({'text': 'Synthetic notification'}),
        dedupe_key='synthetic-safe-telegram-error',
    )
    account = app_module.TelegramAccount(
        user_id=admin.id, telegram_username='synthetic_telegram_error',
        telegram_chat_id='synthetic-chat',
        is_linked=True, delivery_enabled=True,
    )
    db_session.add_all([event, account])
    db_session.commit()
    response = response_with_payload({'ok': False, 'description': PRIVATE_TEXT}, 429)
    calls = []

    def fail_send(url, **kwargs):
        calls.append(True)
        return response

    monkeypatch.setattr(requests, 'post', fail_send)
    before = app_module._utcnow()
    result = app_module.process_pending_notifications(
        limit=1, event_ids=[event.id], schedule_events=False,
    )
    db_session.refresh(event)
    delivery = app_module.NotificationDelivery.query.filter_by(notification_id=event.id).one()
    assert result['failed'] == 1
    assert event.status == 'queued'
    assert event.processing_started_at is None
    assert before + app_module.timedelta(minutes=5) <= event.scheduled_for
    assert event.scheduled_for <= app_module._utcnow() + app_module.timedelta(minutes=5)
    assert delivery.delivery_status == 'error'
    assert delivery.error == 'Telegram API HTTP request failed (HTTP 429)'
    error_log = app_module.ActionLog.query.filter_by(action='delivery_error').one()
    log_payload = json.loads(error_log.payload)
    assert log_payload['error'] == delivery.error
    for forbidden in (SYNTHETIC_SECRET, PRIVATE_TEXT, 'https://'):
        assert forbidden not in delivery.error
        assert forbidden not in error_log.payload
    assert calls == [True]


SAFE_LEGACY_ERROR = 'Ошибка Telegram API (подробности скрыты)'
LEGACY_ROUTES = [
    '/api/notifications/overview',
    '/api/notifications/history',
    '/api/admin/action-log',
]


@pytest.mark.parametrize('text', [
    f'400 Client Error: {SYNTHETIC_URL}',
    f'404 Client Error: https://api.telegram.org/file/bot{SYNTHETIC_SECRET}/avatar.jpg',
    f'https://API.TELEGRAM.ORG/bot{SYNTHETIC_SECRET}/getFile',
    f'api.telegram.org/bot{SYNTHETIC_SECRET}/sendMessage',
])
def test_legacy_telegram_urls_are_redacted_without_token_lookup(text):
    assert app_module._redact_telegram_error_value(text) == SAFE_LEGACY_ERROR


@pytest.mark.parametrize('value', [
    '', None, False, True, 0, 42,
    'Доставка Telegram отключена или аккаунт не привязан',
    'Тихие часы',
    'Telegram API HTTP request failed (HTTP 429)',
    'https://example.org/documentation',
    'https://api.telegram.org/getFile',
])
def test_legacy_redaction_preserves_normal_values(value):
    assert app_module._redact_telegram_error_value(value) == value


def test_legacy_redaction_copies_recursive_json_without_mutating_input():
    original = {
        'error': SYNTHETIC_URL,
        'nested': [PRIVATE_TEXT, {'error': SYNTHETIC_URL, 'count': 2}, False, None],
        'status': 'error', 'count': 3,
    }
    snapshot = json.dumps(original)
    redacted = app_module._redact_telegram_error_value(original)
    assert redacted == {
        'error': SAFE_LEGACY_ERROR,
        'nested': [PRIVATE_TEXT, {'error': SAFE_LEGACY_ERROR, 'count': 2}, False, None],
        'status': 'error', 'count': 3,
    }
    assert json.dumps(original) == snapshot
    assert redacted is not original
    assert redacted['nested'] is not original['nested']
    assert redacted['nested'][1] is not original['nested'][1]


@pytest.fixture()
def legacy_error_records(factories, db_session):
    admin = factories.user('synthetic-legacy-admin', role='admin')
    lead = factories.user('synthetic-legacy-lead', role='team_lead')
    volunteer = factories.user('synthetic-legacy-volunteer')
    initial = factories.user('synthetic-legacy-initial', password=None)
    pool = factories.pool('Synthetic legacy error pool', active=True)
    factories.assign(admin, pool, pool_role='responsible_admin')
    factories.assign(lead, pool, pool_role='responsible_team_lead')
    factories.assign(volunteer, pool)
    factories.assign(initial, pool)
    notification = app_module.NotificationEvent(
        type='synthetic_legacy', status='queued', priority='normal',
        recipient_user_id=volunteer.id, pool_id=pool.id,
        payload=json.dumps({'text': 'Synthetic event text', 'number': 7}),
        dedupe_key='synthetic-legacy-event', source_entity='synthetic', source_entity_id=17,
    )
    db_session.add(notification)
    db_session.flush()
    values = [
        ('error', f'400 Client Error: {SYNTHETIC_URL}', SAFE_LEGACY_ERROR),
        ('error', f'https://api.telegram.org/file/bot{SYNTHETIC_SECRET}/photo.jpg', SAFE_LEGACY_ERROR),
        ('error', 'Telegram API connection failed', 'Telegram API connection failed'),
        ('skipped', 'Доставка Telegram отключена или аккаунт не привязан',
         'Доставка Telegram отключена или аккаунт не привязан'),
        ('sent', None, ''),
    ]
    deliveries = []
    for status, error, expected in values:
        delivery = app_module.NotificationDelivery(
            notification_id=notification.id, user_id=volunteer.id,
            telegram_chat_id='synthetic-legacy-chat', delivery_status=status,
            error=error, message_id='synthetic-message' if status == 'sent' else None,
        )
        db_session.add(delivery)
        deliveries.append((delivery, expected))
    payload = {
        'error': SYNTHETIC_URL, 'event_type': 'synthetic_legacy', 'count': 5,
        'nested': [False, None, {'error': SYNTHETIC_URL, 'normal': PRIVATE_TEXT}],
    }
    error_log = app_module.ActionLog(
        action='delivery_error', entity='notification_event', entity_id=notification.id,
        description='Synthetic legacy error', payload=json.dumps(payload),
    )
    normal_log = app_module.ActionLog(
        action='update', entity='synthetic', entity_id=17,
        description='Synthetic normal action', payload=json.dumps({'normal': PRIVATE_TEXT, 'count': 2}),
    )
    db_session.add_all([error_log, normal_log])
    db_session.commit()
    return {
        'admin': admin, 'lead': lead, 'volunteer': volunteer, 'initial': initial,
        'event_id': notification.id,
        'deliveries': {row.id: (row.delivery_status, expected) for row, expected in deliveries},
        'error_log_id': error_log.id, 'normal_log_id': normal_log.id,
    }


def legacy_database_snapshot(db_session):
    db_session.expire_all()
    return (
        [(row.id, row.error, row.delivery_status, row.message_id)
         for row in app_module.NotificationDelivery.query.order_by(app_module.NotificationDelivery.id)],
        [(row.id, row.payload, row.action, row.description)
         for row in app_module.ActionLog.query.order_by(app_module.ActionLog.id)],
        [(row.id, row.payload, row.status, row.scheduled_for, row.processing_started_at)
         for row in app_module.NotificationEvent.query.order_by(app_module.NotificationEvent.id)],
    )


@pytest.fixture()
def response_read_only_guard(db_session, monkeypatch):
    @contextmanager
    def guard():
        commits, writes = [], []
        monkeypatch.setattr(db_session, 'commit', lambda: commits.append(True))
        engine = app_module.db.engine

        def before_execute(connection, cursor, statement, parameters, context, executemany):
            verb = statement.lstrip().split(None, 1)[0].upper()
            if verb in {'INSERT', 'UPDATE', 'DELETE', 'REPLACE', 'CREATE', 'ALTER', 'DROP'}:
                writes.append(verb)
                pytest.fail('Read-only response attempted a database write')

        sqlalchemy_event.listen(engine, 'before_cursor_execute', before_execute)
        try:
            yield
        finally:
            sqlalchemy_event.remove(engine, 'before_cursor_execute', before_execute)
        assert commits == []
        assert writes == []

    return guard


@pytest.mark.parametrize('role', ['admin', 'lead'])
@pytest.mark.parametrize('route', LEGACY_ROUTES)
def test_legacy_get_responses_hide_credentials_without_database_changes(
        client, auth_headers, db_session, legacy_error_records, response_read_only_guard, role, route):
    records = legacy_error_records
    headers = auth_headers(records[role])
    before = legacy_database_snapshot(db_session)
    with response_read_only_guard():
        response = client.get(route, headers=headers)
        assert response.status_code == 200
        assert SYNTHETIC_SECRET not in response.get_data(as_text=True)
        assert 'api.telegram.org/' not in response.get_data(as_text=True)
        payload = response.get_json()
        if route.endswith('/overview'):
            values = {row['id']: (row['delivery_status'], row['error'])
                      for row in payload['recent_deliveries']}
            assert values == records['deliveries']
        elif route.endswith('/history'):
            assert len(payload) == 1
            notification = payload[0]
            assert notification['id'] == records['event_id']
            assert notification['status'] == 'queued'
            assert notification['payload'] == {'text': 'Synthetic event text', 'number': 7}
            assert notification['source_entity_id'] == 17
            values = {row['id']: (row['status'], row['error']) for row in notification['deliveries']}
            assert values == records['deliveries']
        else:
            logs = {row['id']: row for row in payload}
            assert logs[records['error_log_id']]['action'] == 'delivery_error'
            assert logs[records['error_log_id']]['payload'] == {
                'error': SAFE_LEGACY_ERROR, 'event_type': 'synthetic_legacy', 'count': 5,
                'nested': [False, None, {'error': SAFE_LEGACY_ERROR, 'normal': PRIVATE_TEXT}],
            }
            assert logs[records['normal_log_id']]['payload'] == {'normal': PRIVATE_TEXT, 'count': 2}
        assert legacy_database_snapshot(db_session) == before


@pytest.mark.parametrize('role, status', [('anonymous', 401), ('volunteer', 403), ('initial', 403)])
@pytest.mark.parametrize('route', LEGACY_ROUTES)
def test_legacy_error_gets_keep_authorization_restrictions_without_writes(
        client, auth_headers, db_session, legacy_error_records, response_read_only_guard, role, status, route):
    headers = {} if role == 'anonymous' else auth_headers(legacy_error_records[role])
    before = legacy_database_snapshot(db_session)
    with response_read_only_guard():
        response = client.get(route, headers=headers)
        assert response.status_code == status
        assert SYNTHETIC_SECRET not in response.get_data(as_text=True)
        if role == 'initial':
            assert response.get_json()['code'] == 'password_change_required'
        assert legacy_database_snapshot(db_session) == before
