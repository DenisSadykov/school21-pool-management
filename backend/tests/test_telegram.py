import app as app_module


def test_telegram_webhook_returns_503_when_bot_not_configured(client, monkeypatch):
    monkeypatch.setattr(app_module, 'TELEGRAM_BOT_TOKEN', '')

    response = client.post('/api/telegram/webhook', json={'message': {'text': '/start'}})

    assert response.status_code == 503
    assert response.get_json()['error'] == 'Telegram бот не настроен'


def test_telegram_start_links_known_user_and_sends_greeting(client, factories, db_session, monkeypatch):
    user = factories.user('odessabu', role='volunteer', telegram='@DenisSadykov', name='Денис')
    monkeypatch.setattr(app_module, 'TELEGRAM_BOT_TOKEN', 'test-bot-token')
    monkeypatch.setattr(app_module, 'sync_telegram_photo', lambda account, telegram_user_id: None)

    sent_messages = []

    def fake_send_message(chat_id, text, disable_notification=False, reply_markup=None):
        sent_messages.append({
            'chat_id': chat_id,
            'text': text,
            'disable_notification': disable_notification,
            'reply_markup': reply_markup,
        })
        return {'message_id': 777}

    monkeypatch.setattr(app_module, 'telegram_send_message', fake_send_message)

    response = client.post('/api/telegram/webhook', json={
        'message': {
            'chat': {'id': 555},
            'from': {'id': 999, 'username': 'DenisSadykov'},
            'text': '/start',
        }
    })

    assert response.status_code == 200
    payload = response.get_json()
    assert payload['ok'] is True
    assert payload['result']['linked'] is True

    account = db_session.query(app_module.TelegramAccount).filter_by(user_id=user.id).one()
    assert account.is_linked is True
    assert account.telegram_chat_id == '555'
    assert account.telegram_username == 'denissadykov'

    assert len(sent_messages) == 1
    assert sent_messages[0]['chat_id'] == 555
    assert 'Привязка прошла успешно.' in sent_messages[0]['text']


def test_telegram_responsibles_command_lists_pool_responsibles(client, factories, db_session, monkeypatch):
    volunteer = factories.user('volunteer1', role='volunteer', telegram='@volunteer1')
    team_lead = factories.user('lead', role='team_lead', password='lead1234', telegram='@lead_tg', name='Лид')
    pool = factories.pool('Active pool', active=True)
    factories.assign(volunteer, pool)
    factories.assign(team_lead, pool, pool_role='responsible_team_lead')

    db_session.add(app_module.TelegramAccount(
        user_id=volunteer.id,
        telegram_username='volunteer1',
        telegram_chat_id='321',
        is_linked=True,
        delivery_enabled=True,
    ))
    db_session.commit()

    monkeypatch.setattr(app_module, 'TELEGRAM_BOT_TOKEN', 'test-bot-token')

    sent_messages = []

    def fake_send_message(chat_id, text, disable_notification=False, reply_markup=None):
        sent_messages.append(text)
        return {'message_id': 888}

    monkeypatch.setattr(app_module, 'telegram_send_message', fake_send_message)

    response = client.post('/api/telegram/webhook', json={
        'message': {
            'chat': {'id': 321},
            'from': {'id': 777, 'username': 'volunteer1'},
            'text': '/responsibles',
        }
    })

    assert response.status_code == 200
    assert response.get_json()['result']['count'] == 1
    assert sent_messages
    assert '@lead' in sent_messages[0]
    assert 'Тимлид' in sent_messages[0]


def test_telegram_callback_marks_penalty_in_workoff(client, factories, db_session, monkeypatch):
    volunteer = factories.user('volunteer1', role='volunteer', telegram='@volunteer1')
    pool = factories.pool('Active pool', active=True)

    penalty = app_module.StudentPenalty(
        student_name='Ivan Student',
        volunteer_id=volunteer.id,
        volunteer_name=volunteer.name or volunteer.nick,
        pool_id=pool.id,
        workoff_status='pending',
    )
    db_session.add(penalty)
    db_session.flush()

    event = app_module.NotificationEvent(
        type='penalty_method_question',
        status='sent',
        recipient_user_id=volunteer.id,
        pool_id=pool.id,
        source_entity='penalty',
        source_entity_id=penalty.id,
        payload='{}',
        dedupe_key='test-method-event',
    )
    db_session.add(event)
    db_session.flush()

    delivery = app_module.NotificationDelivery(
        notification_id=event.id,
        user_id=volunteer.id,
        telegram_chat_id='321',
        delivery_status='sent',
        message_id='111',
    )
    account = app_module.TelegramAccount(
        user_id=volunteer.id,
        telegram_username='volunteer1',
        telegram_chat_id='321',
        is_linked=True,
        delivery_enabled=True,
    )
    db_session.add_all([delivery, account])
    db_session.commit()

    monkeypatch.setattr(app_module, 'TELEGRAM_BOT_TOKEN', 'test-bot-token')

    answered = []
    deleted = []

    monkeypatch.setattr(app_module, 'telegram_answer_callback', lambda callback_query_id, text='Готово': answered.append((callback_query_id, text)) or {'ok': True})
    monkeypatch.setattr(app_module, 'telegram_delete_message', lambda chat_id, message_id: deleted.append((chat_id, message_id)) or {'ok': True})

    response = client.post('/api/telegram/webhook', json={
        'callback_query': {
            'id': 'cb-1',
            'from': {'id': 777, 'username': 'volunteer1'},
            'message': {'chat': {'id': 321}},
            'data': f'p:{penalty.id}:m:y:{event.id}',
        }
    })

    assert response.status_code == 200
    db_session.refresh(penalty)
    db_session.refresh(event)
    db_session.refresh(delivery)

    assert penalty.workoff_status == 'in_workoff'
    assert event.status == 'sent'
    assert deleted == [('321', '111')]
    assert answered == [('cb-1', 'Статус: отрабатывает')]


def test_telegram_callback_marks_penalty_awaiting_unlock(client, factories, db_session, monkeypatch):
    admin = factories.user('admin', role='admin', password='secret123')
    volunteer = factories.user('volunteer1', role='volunteer', telegram='@volunteer1')
    pool = factories.pool('Active pool', active=True)
    factories.assign(admin, pool, pool_role='responsible_admin')

    penalty = app_module.StudentPenalty(
        student_name='Petr Student',
        volunteer_id=volunteer.id,
        volunteer_name=volunteer.name or volunteer.nick,
        pool_id=pool.id,
        workoff_status='in_workoff',
    )
    db_session.add(penalty)
    db_session.flush()

    event = app_module.NotificationEvent(
        type='penalty_workoff_check',
        status='sent',
        recipient_user_id=volunteer.id,
        pool_id=pool.id,
        source_entity='penalty',
        source_entity_id=penalty.id,
        payload='{}',
        dedupe_key='test-complete-event',
    )
    db_session.add(event)
    db_session.flush()

    delivery = app_module.NotificationDelivery(
        notification_id=event.id,
        user_id=volunteer.id,
        telegram_chat_id='321',
        delivery_status='sent',
        message_id='222',
    )
    volunteer_account = app_module.TelegramAccount(
        user_id=volunteer.id,
        telegram_username='volunteer1',
        telegram_chat_id='321',
        is_linked=True,
        delivery_enabled=True,
    )
    admin_account = app_module.TelegramAccount(
        user_id=admin.id,
        telegram_username='admin',
        telegram_chat_id='999',
        is_linked=True,
        delivery_enabled=True,
    )
    db_session.add_all([delivery, volunteer_account, admin_account])
    db_session.commit()

    monkeypatch.setattr(app_module, 'TELEGRAM_BOT_TOKEN', 'test-bot-token')

    answered = []
    deleted = []

    monkeypatch.setattr(app_module, 'telegram_answer_callback', lambda callback_query_id, text='Готово': answered.append((callback_query_id, text)) or {'ok': True})
    monkeypatch.setattr(app_module, 'telegram_delete_message', lambda chat_id, message_id: deleted.append((chat_id, message_id)) or {'ok': True})

    response = client.post('/api/telegram/webhook', json={
        'callback_query': {
            'id': 'cb-2',
            'from': {'id': 777, 'username': 'volunteer1'},
            'message': {'chat': {'id': 321}},
            'data': f'p:{penalty.id}:c:y:{event.id}',
        }
    })

    assert response.status_code == 200
    db_session.refresh(penalty)
    db_session.refresh(event)
    db_session.refresh(delivery)

    assert penalty.workoff_status == 'awaiting_unlock'
    assert event.status == 'sent'
    assert deleted == [('321', '222')]
    assert answered == [('cb-2', 'Статус: ожидает разблокировки')]

    admin_events = db_session.query(app_module.NotificationEvent).filter_by(
        source_entity='penalty',
        source_entity_id=penalty.id,
        type='penalty_admin_unlock',
    ).all()
    assert admin_events
    assert any(item.recipient_user_id == admin.id for item in admin_events)


def test_telegram_callback_method_no_queues_retry_without_cancelling_new_event(client, factories, db_session, monkeypatch):
    volunteer = factories.user('volunteer1', role='volunteer', telegram='@volunteer1')
    pool = factories.pool('Active pool', active=True)

    penalty = app_module.StudentPenalty(
        student_name='Retry Student',
        volunteer_id=volunteer.id,
        volunteer_name=volunteer.name or volunteer.nick,
        pool_id=pool.id,
        workoff_status='pending',
    )
    db_session.add(penalty)
    db_session.flush()

    event = app_module.NotificationEvent(
        type='penalty_method_question',
        status='sent',
        recipient_user_id=volunteer.id,
        pool_id=pool.id,
        source_entity='penalty',
        source_entity_id=penalty.id,
        payload='{}',
        dedupe_key='test-method-no-event',
    )
    db_session.add(event)
    db_session.flush()
    delivery = app_module.NotificationDelivery(
        notification_id=event.id,
        user_id=volunteer.id,
        telegram_chat_id='321',
        delivery_status='sent',
        message_id='333',
    )
    account = app_module.TelegramAccount(
        user_id=volunteer.id,
        telegram_username='volunteer1',
        telegram_chat_id='321',
        is_linked=True,
        delivery_enabled=True,
    )
    db_session.add_all([delivery, account])
    db_session.commit()

    monkeypatch.setattr(app_module, 'TELEGRAM_BOT_TOKEN', 'test-bot-token')
    monkeypatch.setattr(app_module, 'time', type('FakeTime', (), {'time': staticmethod(lambda: 123456)})())
    monkeypatch.setattr(app_module, '_users_on_shift', lambda pool_id: [volunteer])

    answered = []
    deleted = []
    monkeypatch.setattr(app_module, 'telegram_answer_callback', lambda callback_query_id, text='Готово': answered.append((callback_query_id, text)) or {'ok': True})
    monkeypatch.setattr(app_module, 'telegram_delete_message', lambda chat_id, message_id: deleted.append((chat_id, message_id)) or {'ok': True})

    response = client.post('/api/telegram/webhook', json={
        'callback_query': {
            'id': 'cb-3',
            'from': {'id': 777, 'username': 'volunteer1'},
            'message': {'chat': {'id': 321}},
            'data': f'p:{penalty.id}:m:n:{event.id}',
        }
    })

    assert response.status_code == 200
    db_session.refresh(penalty)
    assert penalty.workoff_status == 'pending'
    assert deleted == [('321', '333')]
    assert answered == [('cb-3', 'Спросим ещё раз через 5 минут')]

    retry_events = db_session.query(app_module.NotificationEvent).filter_by(
        type='penalty_method_question',
        source_entity='penalty',
        source_entity_id=penalty.id,
        status='queued',
    ).all()
    assert len(retry_events) == 1
    assert retry_events[0].id != event.id


def test_telegram_callback_complete_no_queues_retry_without_cancelling_new_event(client, factories, db_session, monkeypatch):
    volunteer = factories.user('volunteer1', role='volunteer', telegram='@volunteer1')
    pool = factories.pool('Active pool', active=True)

    penalty = app_module.StudentPenalty(
        student_name='Retry Complete',
        volunteer_id=volunteer.id,
        volunteer_name=volunteer.name or volunteer.nick,
        pool_id=pool.id,
        workoff_status='in_workoff',
    )
    db_session.add(penalty)
    db_session.flush()

    event = app_module.NotificationEvent(
        type='penalty_workoff_check',
        status='sent',
        recipient_user_id=volunteer.id,
        pool_id=pool.id,
        source_entity='penalty',
        source_entity_id=penalty.id,
        payload='{}',
        dedupe_key='test-complete-no-event',
    )
    db_session.add(event)
    db_session.flush()
    delivery = app_module.NotificationDelivery(
        notification_id=event.id,
        user_id=volunteer.id,
        telegram_chat_id='321',
        delivery_status='sent',
        message_id='444',
    )
    account = app_module.TelegramAccount(
        user_id=volunteer.id,
        telegram_username='volunteer1',
        telegram_chat_id='321',
        is_linked=True,
        delivery_enabled=True,
    )
    db_session.add_all([delivery, account])
    db_session.commit()

    monkeypatch.setattr(app_module, 'TELEGRAM_BOT_TOKEN', 'test-bot-token')
    monkeypatch.setattr(app_module, 'time', type('FakeTime', (), {'time': staticmethod(lambda: 789012)})())
    monkeypatch.setattr(app_module, '_users_on_shift', lambda pool_id: [volunteer])

    answered = []
    deleted = []
    monkeypatch.setattr(app_module, 'telegram_answer_callback', lambda callback_query_id, text='Готово': answered.append((callback_query_id, text)) or {'ok': True})
    monkeypatch.setattr(app_module, 'telegram_delete_message', lambda chat_id, message_id: deleted.append((chat_id, message_id)) or {'ok': True})

    response = client.post('/api/telegram/webhook', json={
        'callback_query': {
            'id': 'cb-4',
            'from': {'id': 777, 'username': 'volunteer1'},
            'message': {'chat': {'id': 321}},
            'data': f'p:{penalty.id}:c:n:{event.id}',
        }
    })

    assert response.status_code == 200
    db_session.refresh(penalty)
    assert penalty.workoff_status == 'in_workoff'
    assert deleted == [('321', '444')]
    assert answered == [('cb-4', 'Спросим ещё раз через 5 минут')]

    retry_events = db_session.query(app_module.NotificationEvent).filter_by(
        type='penalty_workoff_check',
        source_entity='penalty',
        source_entity_id=penalty.id,
        status='queued',
    ).all()
    assert len(retry_events) == 1
    assert retry_events[0].id != event.id
