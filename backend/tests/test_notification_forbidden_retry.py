import json
import pytest
import requests
import app as m


@pytest.fixture()
def notification(factories, db_session, monkeypatch):
    user = factories.user('synthetic-forbidden-recipient', role='admin')
    pool = factories.pool('Synthetic retry pool', active=True)
    member = factories.assign(user, pool, pool_role='responsible_admin')
    account = m.TelegramAccount(user_id=user.id, telegram_username='synthetic_forbidden',
                               telegram_chat_id='synthetic-private-chat',
                               is_linked=True, delivery_enabled=True)
    event = m.NotificationEvent(type='penalty_admin_unlock', priority='urgent', status='queued',
                               recipient_user_id=user.id, pool_id=pool.id,
                               dedupe_key='synthetic-forbidden', payload=json.dumps({'text': 'Synthetic'}))
    db_session.add_all([account, event])
    db_session.commit()
    monkeypatch.setattr(m, 'enqueue_scheduled_notifications', lambda: None)
    return user, member, account, event


def http_error(status):
    response = requests.Response()
    response.status_code = status
    return requests.HTTPError(f'Telegram API HTTP request failed (HTTP {status})', response=response)


def dispatch():
    return m.process_pending_notifications(limit=20, schedule_events=False)


def test_new_403_is_visible_but_not_automatically_retried(notification, db_session, monkeypatch,
                                                       client, auth_headers):
    user, member, account, event = notification
    calls = []

    def refuse(*args, **kwargs):
        calls.append(True)
        raise http_error(403)

    monkeypatch.setattr(m, 'telegram_send_message', refuse)
    assert dispatch()['failed'] == 1
    db_session.refresh(event)
    delivery = m.NotificationDelivery.query.filter_by(notification_id=event.id).one()
    assert event.status == 'error'
    assert event.scheduled_for is None and event.processing_started_at is None
    assert delivery.delivery_status == 'error'
    assert delivery.error == m.TELEGRAM_FORBIDDEN_DELIVERY_ERROR
    assert delivery.message_id is None
    assert dispatch()['processed'] == 0 and calls == [True]
    assert m.NotificationDelivery.query.filter_by(notification_id=event.id).count() == 1
    assert m.ActionLog.query.filter_by(action='delivery_error').count() == 1
    assert user.active and member.notifications_enabled and account.is_linked and account.delivery_enabled
    overview = client.get('/api/notifications/overview', headers=auth_headers(user))
    assert overview.status_code == 200
    visible = overview.get_json()['recent_deliveries'][0]
    assert visible['delivery_status'] == 'error'
    assert visible['error'] == m.TELEGRAM_FORBIDDEN_DELIVERY_ERROR


def test_existing_403_is_preserved_without_another_send(notification, db_session, monkeypatch):
    user, member, account, event = notification
    delivery = m.NotificationDelivery(notification_id=event.id, user_id=user.id,
                                     telegram_chat_id=account.telegram_chat_id, delivery_status='error',
                                     error=m.TELEGRAM_FORBIDDEN_DELIVERY_ERROR)
    db_session.add(delivery)
    db_session.commit()
    original = (event.payload, event.created_at, event.dedupe_key, delivery.id,
                delivery.created_at, delivery.telegram_chat_id)
    monkeypatch.setattr(m, 'telegram_send_message', lambda *a, **k: pytest.fail('Must not resend known 403'))
    assert dispatch()['failed'] == 1
    db_session.refresh(event)
    assert event.status == 'error'
    assert event.scheduled_for is None and event.processing_started_at is None
    assert (event.payload, event.created_at, event.dedupe_key, delivery.id,
            delivery.created_at, delivery.telegram_chat_id) == original
    assert delivery.delivery_status == 'error' and delivery.error == m.TELEGRAM_FORBIDDEN_DELIVERY_ERROR
    assert dispatch()['processed'] == 0
    log = m.ActionLog.query.filter_by(action='delivery_error').one()
    assert json.loads(log.payload)['reason'] == 'automatic_retry_stopped_forbidden'
    assert user.active and member.notifications_enabled and account.is_linked and account.delivery_enabled


@pytest.mark.parametrize('error', [http_error(429), http_error(500),
                                  requests.Timeout('Telegram API request timed out'),
                                  RuntimeError('provider text mentions HTTP 403')])
def test_transient_or_untyped_errors_preserve_retry(notification, db_session, monkeypatch, error):
    _, _, _, event = notification

    def fail(*args, **kwargs):
        raise error

    monkeypatch.setattr(m, 'telegram_send_message', fail)
    before = m._utcnow()
    assert dispatch()['failed'] == 1
    db_session.refresh(event)
    assert event.status == 'queued' and event.processing_started_at is None
    assert event.scheduled_for >= before + m.timedelta(minutes=5)


def test_forbidden_recipient_does_not_block_other_delivery(notification, factories, db_session, monkeypatch):
    _, _, _, bad = notification
    other = factories.user('synthetic-allowed-recipient')
    factories.assign(other, db_session.get(m.Pool, bad.pool_id))
    account = m.TelegramAccount(user_id=other.id, telegram_username='synthetic_allowed',
                               telegram_chat_id='synthetic-allowed-chat',
                               is_linked=True, delivery_enabled=True)
    good = m.NotificationEvent(type='shift_change_staff', priority='urgent', status='queued',
                              pool_id=bad.pool_id, recipient_user_id=other.id,
                              dedupe_key='synthetic-allowed-event', payload=json.dumps({'text': 'Allowed'}))
    db_session.add_all([account, good])
    db_session.commit()

    def send(chat_id, *args, **kwargs):
        if chat_id == 'synthetic-private-chat':
            raise http_error(403)
        return {'message_id': 123}

    monkeypatch.setattr(m, 'telegram_send_message', send)
    result = dispatch()
    assert result['failed'] == 1 and result['sent'] == 1
    db_session.refresh(bad)
    db_session.refresh(good)
    assert bad.status == 'error' and good.status == 'sent'


def test_new_event_for_same_account_can_still_be_delivered(notification, db_session, monkeypatch):
    user, _, _, old = notification
    old.status = 'error'
    old.scheduled_for = None
    new = m.NotificationEvent(type='shift_change_staff', priority='urgent', status='queued',
                             pool_id=old.pool_id, recipient_user_id=user.id,
                             dedupe_key='synthetic-new-after-refusal', payload=json.dumps({'text': 'New'}))
    db_session.add(new)
    db_session.commit()
    calls = []

    def send(*args, **kwargs):
        calls.append(True)
        return {'message_id': 321}

    monkeypatch.setattr(m, 'telegram_send_message', send)
    assert dispatch()['sent'] == 1
    db_session.refresh(new)
    assert new.status == 'sent' and old.status == 'error' and calls == [True]
