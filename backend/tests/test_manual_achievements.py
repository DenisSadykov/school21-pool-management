import base64
import io
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from unittest.mock import Mock

import pytest
from sqlalchemy import inspect

import app as module
from migrate_manual_achievements import migrate


PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')


def create(client, headers, key='drawn-award', title='Ручная награда', image=PNG, mime='image/png'):
    return client.post('/api/admin/achievements', headers=headers, data={
        'key': key, 'title': title, 'file': (io.BytesIO(image), 'award.png', mime),
    })


def grant(client, headers, item_id, user_id, **extra):
    return client.post(f'/api/admin/achievements/{item_id}/awards', headers=headers,
                       json={'user_id': user_id, **extra})


def test_only_admin_can_create_and_grant(client, factories, auth_headers):
    admin = factories.user('owner', role='admin')
    recipient = factories.user('recipient')
    item = create(client, auth_headers(admin)).json
    assert client.get('/api/me/achievements').status_code == 401
    assert client.get(f'/api/achievements/{item["id"]}/image').status_code == 401
    assert create(client, {}).status_code == 401
    assert grant(client, {}, item['id'], recipient.id).status_code == 401
    for role in ('volunteer', 'team_lead', 'tribe_master', 'tribe_assistant'):
        user = factories.user(role, role=role)
        assert create(client, auth_headers(user)).status_code == 403
        assert grant(client, auth_headers(user), item['id'], recipient.id).status_code == 403
    initial = factories.user('initial', password=None)
    assert client.get('/api/me/achievements', headers=auth_headers(initial)).status_code == 403
    assert client.get(item['image_url'], headers=auth_headers(initial)).status_code == 403
    assert module.UserAchievement.query.count() == 0


def test_idempotent_private_award_and_no_coin_changes(client, factories, auth_headers, db_session):
    admin = factories.user('owner', role='admin')
    recipient = factories.user('recipient', coins_adjustment=17)
    other = factories.user('other')
    headers = auth_headers(admin)
    first = create(client, headers)
    assert first.status_code == 201
    item = first.json
    assert create(client, headers).status_code == 200
    assert create(client, headers, title='Не менять выданную').status_code == 409
    assert module.ManualAchievement.query.count() == 1
    before = client.get('/api/me/statistics', headers=auth_headers(recipient)).json
    first_award = grant(client, headers, item['id'], recipient.id)
    assert first_award.status_code == 201
    assert first_award.json['notification_status'] == 'not_requested'
    repeated = grant(client, headers, item['id'], recipient.id, notify=True)
    assert repeated.status_code == 200 and repeated.json['created'] is False
    assert module.NotificationEvent.query.count() == 0
    assert module.UserAchievement.query.count() == 1
    assert recipient.coins_adjustment == 17
    after = client.get('/api/me/statistics', headers=auth_headers(recipient)).json
    assert after['summary'] == before['summary']
    assert after['achievements'] == []
    owned = client.get('/api/me/achievements?user_id=999', headers=auth_headers(recipient))
    assert len(owned.json) == 1 and owned.json[0]['title'] == item['title']
    assert owned.json[0]['granted_at'].endswith('Z')
    assert 'no-store' in owned.headers['Cache-Control']
    assert client.get(f'/api/me/achievements?user_id={recipient.id}', headers=auth_headers(other)).json == []
    assert client.get(item['image_url'], headers=auth_headers(other)).status_code == 404
    image = client.get(item['image_url'], headers=auth_headers(recipient))
    assert image.data == PNG and image.mimetype == 'image/png'
    assert 'no-store' in image.headers['Cache-Control']
    assert client.get(item['image_url'], headers=headers).status_code == 200
    assert module.ActionLog.query.filter_by(action='grant', entity='user_achievement').count() == 1
    # Identity is stable across nickname and active-pool changes.
    recipient.nick = 'renamed'
    db_session.commit()
    assert len(client.get('/api/me/achievements', headers=auth_headers(recipient)).json) == 1
    assert grant(client, headers, item['id'], other.id).status_code == 201


@pytest.mark.parametrize('image,mime', [(b'', 'image/png'), (b'<svg/>', 'image/png'),
                                      (PNG, 'image/jpeg'), (PNG + b'x' * (3 * 1024 * 1024), 'image/png')])
def test_reject_invalid_images(client, factories, auth_headers, image, mime):
    admin = factories.user('owner', role='admin')
    assert create(client, auth_headers(admin), image=image, mime=mime).status_code == 400
    assert module.ManualAchievement.query.count() == 0


def test_validate_inputs_and_order(client, factories, auth_headers, db_session):
    admin = factories.user('owner', role='admin')
    recipient = factories.user('recipient')
    inactive = factories.user('inactive', active=False)
    headers = auth_headers(admin)
    assert create(client, headers, title=' ').status_code == 400
    assert create(client, headers, key='../bad').status_code == 400
    assert create(client, headers, title='x' * 141).status_code == 400
    item = create(client, headers).json
    for bad_id in (True, '1', -1, None):
        assert grant(client, headers, item['id'], bad_id).status_code == 400
    assert grant(client, headers, item['id'], recipient.id, notify='true').status_code == 400
    assert grant(client, headers, item['id'], inactive.id).status_code == 404
    assert grant(client, headers, 99999, recipient.id).status_code == 404
    grant(client, headers, item['id'], recipient.id)
    second = create(client, headers, key='second-award').json
    grant(client, headers, second['id'], recipient.id)
    rows = client.get('/api/me/achievements', headers=auth_headers(recipient)).json
    assert [row['id'] for row in rows] == [second['id'], item['id']]


def test_notify_once_through_existing_dispatcher(client, factories, auth_headers, db_session, monkeypatch):
    admin = factories.user('owner', role='admin')
    recipient = factories.user('recipient')
    headers = auth_headers(admin)
    db_session.add(module.TelegramAccount(user_id=recipient.id, telegram_username='test',
                                         telegram_chat_id='synthetic-chat', is_linked=True, delivery_enabled=True))
    db_session.commit()
    item = create(client, headers).json
    first = grant(client, headers, item['id'], recipient.id, notify=True)
    assert first.json['notification_status'] == 'queued'
    assert grant(client, headers, item['id'], recipient.id, notify=True).status_code == 200
    event = module.NotificationEvent.query.one()
    assert event.pool_id is None and event.type == 'manual_achievement_awarded'
    assert 'Ручная награда' in module.build_notification_text(event)
    markup = module.build_notification_reply_markup(event)
    assert markup['inline_keyboard'][0][0]['url'].endswith('/profile?tab=achievements')
    sender = Mock(return_value={'message_id': 'synthetic-message'})
    monkeypatch.setattr(module, 'telegram_send_message', sender)
    monkeypatch.setattr(module, 'telegram_is_quiet_hours', lambda now: True)
    result = module.process_pending_notifications(event_ids=[event.id], schedule_events=False)
    assert result['sent'] == 1
    assert sender.call_args.kwargs['disable_notification'] is True
    module.process_pending_notifications(event_ids=[event.id], schedule_events=False)
    assert sender.call_count == 1
    assert module.NotificationDelivery.query.one().delivery_status == 'sent'
    assert grant(client, headers, item['id'], recipient.id, notify=True).json['notification_status'] == 'sent'


@pytest.mark.parametrize('delivery_enabled', [True, False])
def test_failure_or_disabled_delivery_keeps_award_without_resending(client, factories, auth_headers, db_session, monkeypatch, delivery_enabled):
    admin = factories.user('owner', role='admin')
    recipient = factories.user('recipient')
    headers = auth_headers(admin)
    db_session.add(module.TelegramAccount(user_id=recipient.id, telegram_username='test',
                                         telegram_chat_id='synthetic-chat', is_linked=True, delivery_enabled=delivery_enabled))
    db_session.commit()
    item = create(client, headers).json
    grant(client, headers, item['id'], recipient.id, notify=True)
    event = module.NotificationEvent.query.one()
    sender = Mock(side_effect=TimeoutError('Telegram API request timed out'))
    monkeypatch.setattr(module, 'telegram_send_message', sender)
    module.process_pending_notifications(event_ids=[event.id], schedule_events=False)
    assert event.status == ('error' if delivery_enabled else 'skipped')
    assert event.scheduled_for is None
    assert module.UserAchievement.query.count() == 1
    module.process_pending_notifications(event_ids=[event.id], schedule_events=False)
    assert sender.call_count == int(delivery_enabled)


def test_stale_award_dispatch_is_not_requeued(db_session, factories):
    recipient = factories.user('recipient')
    event = module.NotificationEvent(type='manual_achievement_awarded', status='processing',
                                     processing_started_at=module._utcnow() - timedelta(minutes=11),
                                     recipient_user_id=recipient.id, dedupe_key='manual-achievement:1')
    db_session.add(event)
    db_session.commit()
    assert module._claim_pending_notification_ids(20) == []
    db_session.refresh(event)
    assert event.status == 'error'


def test_concurrent_grants_have_one_award_and_notification(app, client, factories, auth_headers):
    admin = factories.user('owner', role='admin')
    recipient = factories.user('recipient')
    headers = auth_headers(admin)
    item_id = create(client, headers).json['id']
    recipient_id = recipient.id
    barrier = Barrier(4)

    def send(_):
        with app.test_client() as thread_client:
            barrier.wait(timeout=10)
            response = grant(thread_client, headers, item_id, recipient_id, notify=True)
            return response.status_code

    with ThreadPoolExecutor(max_workers=4) as executor:
        statuses = list(executor.map(send, range(4)))
    assert sorted(statuses) == [200, 200, 200, 201]
    assert module.UserAchievement.query.count() == 1
    assert module.NotificationEvent.query.count() == 1


def test_migration_is_additive_idempotent_and_empty(db_session, factories):
    user = factories.user('untouched', coins_adjustment=23)
    engine = module.db.engine
    module.UserAchievement.__table__.drop(engine)
    module.ManualAchievement.__table__.drop(engine)
    before = set(inspect(engine).get_table_names())
    migrate(engine)
    migrate(engine)
    after = set(inspect(engine).get_table_names())
    assert after - before == {'manual_achievements', 'user_achievements'}
    assert module.ManualAchievement.query.count() == 0
    assert module.UserAchievement.query.count() == 0
    assert module.NotificationEvent.query.count() == 0
    db_session.refresh(user)
    assert user.coins_adjustment == 23


def test_account_deletion_handles_awards_and_author(client, factories, auth_headers):
    admin = factories.user('owner', role='admin')
    issuer = factories.user('issuer', role='admin')
    recipient = factories.user('recipient')
    item = create(client, auth_headers(issuer)).json
    grant(client, auth_headers(issuer), item['id'], recipient.id)
    assert client.delete(f'/api/users/{issuer.id}', headers=auth_headers(admin)).status_code == 200
    assert module.ManualAchievement.query.one().created_by is None
    award = module.UserAchievement.query.one()
    assert award.granted_by is None and award.granted_by_nick == 'issuer'
    assert client.delete(f'/api/users/{recipient.id}', headers=auth_headers(admin)).status_code == 200
    assert module.UserAchievement.query.count() == 0
