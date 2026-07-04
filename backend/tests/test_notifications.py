import app as app_module


def test_dispatch_requires_internal_secret(client):
    response = client.post('/api/notifications/dispatch')

    assert response.status_code == 403
    assert response.get_json()['error'] == 'Недостаточно прав для dispatch'


def test_dispatch_accepts_internal_secret(client, monkeypatch):
    monkeypatch.setattr(
        app_module,
        'process_pending_notifications',
        lambda limit=20: {'processed': 2, 'sent': 1, 'failed': 0, 'skipped': 1},
    )

    response = client.post(
        '/api/notifications/dispatch?limit=15',
        headers={'X-Internal-Secret': 'test-internal-secret'},
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload == {'ok': True, 'processed': 2, 'sent': 1, 'failed': 0, 'skipped': 1}


def test_create_dashboard_note_for_active_pool(client, factories, auth_headers, db_session):
    admin = factories.user('admin', role='admin', password='secret123')
    pool = factories.pool('Active pool', active=True)

    response = client.post(
        '/api/notifications/notes',
        headers=auth_headers(admin),
        json={'text': 'Проверить бриф', 'is_pinned': True, 'is_highlighted': True},
    )

    assert response.status_code == 201
    payload = response.get_json()
    assert payload['text'] == 'Проверить бриф'
    assert payload['is_pinned'] is True
    assert payload['is_highlighted'] is True
    assert payload['pool_id'] == pool.id

    note = db_session.query(app_module.DashboardNote).one()
    assert note.text == 'Проверить бриф'


def test_create_broadcast_creates_events_and_skips_unlinked_users(client, factories, auth_headers, db_session, monkeypatch):
    monkeypatch.setattr(
        app_module,
        'process_pending_notifications',
        lambda limit=20: {'processed': 0, 'sent': 0, 'failed': 0, 'skipped': 0},
    )

    admin = factories.user('admin', role='admin', password='secret123')
    volunteer_linked = factories.user('vol_linked', role='volunteer', telegram='@linked_user')
    volunteer_unlinked = factories.user('vol_unlinked', role='volunteer')
    pool = factories.pool('Active pool', active=True)
    factories.assign(volunteer_linked, pool)
    factories.assign(volunteer_unlinked, pool)

    db_session.add(app_module.TelegramAccount(
        user_id=volunteer_linked.id,
        telegram_username='linked_user',
        telegram_chat_id='12345',
        is_linked=True,
        delivery_enabled=True,
    ))
    db_session.commit()

    response = client.post(
        '/api/notifications/broadcasts',
        headers=auth_headers(admin),
        json={
            'text': 'Сегодня общий сбор в 14:00',
            'priority': 'normal',
            'filters': {'role': 'volunteer'},
            'is_anonymous': True,
        },
    )

    assert response.status_code == 201
    payload = response.get_json()
    assert payload['text'] == 'Сегодня общий сбор в 14:00'
    assert payload['is_anonymous'] is True

    broadcast = db_session.query(app_module.Broadcast).one()
    assert broadcast.text == 'Сегодня общий сбор в 14:00'

    events = db_session.query(app_module.NotificationEvent).filter_by(
        source_entity='broadcast',
        source_entity_id=broadcast.id,
    ).all()
    assert len(events) == 2

    deliveries = db_session.query(app_module.NotificationDelivery).all()
    statuses_by_user = {delivery.user_id: delivery.delivery_status for delivery in deliveries}
    assert statuses_by_user[volunteer_linked.id] == 'pending'
    assert statuses_by_user[volunteer_unlinked.id] == 'skipped'

