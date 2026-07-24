from datetime import date, datetime, time, timedelta

import app as app_module


def test_deactivated_user_existing_token_is_rejected(client, factories, auth_headers, db_session):
    user = factories.user('inactive_later')
    headers = auth_headers(user)
    user.active = False
    db_session.commit()

    response = client.get('/api/auth/me', headers=headers)

    assert response.status_code == 401


def test_active_pool_cannot_be_archived(client, factories, auth_headers):
    admin = factories.user('admin', role='admin', password='secret123')
    pool = factories.pool('Active pool', active=True)

    response = client.post(f'/api/pools/{pool.id}/archive', headers=auth_headers(admin))

    assert response.status_code == 409
    assert response.get_json()['error'] == 'Сначала активируйте другой бассейн'


def test_pool_delete_removes_invite_link(client, factories, auth_headers, db_session):
    admin = factories.user('admin', role='admin', password='secret123')
    pool = factories.pool('Old pool', active=False, archived=True)
    invite = app_module.PoolInviteLink(
        pool_id=pool.id,
        token='delete-me',
        created_by=admin.id,
    )
    db_session.add(invite)
    db_session.commit()

    response = client.delete(f'/api/pools/{pool.id}', headers=auth_headers(admin))

    assert response.status_code == 200
    assert db_session.query(app_module.PoolInviteLink).count() == 0


def test_same_student_nick_can_exist_in_different_pools(client, factories, auth_headers):
    admin = factories.user('admin', role='admin', password='secret123')
    first_pool = factories.pool('First', active=True)
    second_pool = factories.pool('Second', active=False)

    first = client.post('/api/students', headers=auth_headers(admin), json={'nick': 'same_student'})
    client.post(f'/api/pools/{second_pool.id}/activate', headers=auth_headers(admin))
    second = client.post('/api/students', headers=auth_headers(admin), json={'nick': 'same_student'})

    assert first.status_code == 201
    assert second.status_code == 201
    assert app_module.Student.query.filter_by(nick='same_student').count() == 2


def test_penalty_requires_student_from_active_pool(client, factories, auth_headers, db_session):
    volunteer = factories.user('volunteer')
    old_pool = factories.pool('Old', active=False)
    active_pool = factories.pool('Active', active=True)
    factories.assign(volunteer, active_pool)
    student = app_module.Student(nick='old_student', name='Old', pool_id=old_pool.id)
    db_session.add(student)
    db_session.commit()

    response = client.post(
        '/api/penalties',
        headers=auth_headers(volunteer),
        json={'student_id': student.id},
    )

    assert response.status_code == 404
    assert app_module.StudentPenalty.query.count() == 0


def test_penalty_overdue_is_idempotent_and_status_is_validated(client, factories, auth_headers, db_session):
    volunteer = factories.user('volunteer')
    pool = factories.pool('Active', active=True)
    factories.assign(volunteer, pool)
    student = app_module.Student(nick='student', name='Student', pool_id=pool.id)
    penalty = app_module.StudentPenalty(
        student_name='student',
        volunteer_id=volunteer.id,
        pool_id=pool.id,
        multiplier=1,
        workoff_status='pending',
    )
    db_session.add_all([student, penalty])
    db_session.flush()
    penalty.student_id = student.id
    db_session.commit()

    first = client.patch(
        f'/api/penalties/{penalty.id}',
        headers=auth_headers(volunteer),
        json={'workoff_status': 'overdue'},
    )
    second = client.patch(
        f'/api/penalties/{penalty.id}',
        headers=auth_headers(volunteer),
        json={'workoff_status': 'overdue'},
    )
    invalid = client.patch(
        f'/api/penalties/{penalty.id}',
        headers=auth_headers(volunteer),
        json={'workoff_status': 'anything'},
    )

    db_session.refresh(penalty)
    assert first.status_code == 200
    assert second.status_code == 200
    assert penalty.multiplier == 2
    assert invalid.status_code == 400


def test_deleting_penalty_removes_history_and_cancels_pending_event(client, factories, auth_headers, db_session):
    admin = factories.user('admin', role='admin', password='secret123')
    volunteer = factories.user('volunteer')
    pool = factories.pool('Active', active=True)
    factories.assign(volunteer, pool)
    student = app_module.Student(nick='student', name='Student', pool_id=pool.id)
    db_session.add(student)
    db_session.flush()
    penalty = app_module.StudentPenalty(student_id=student.id, student_name=student.nick, pool_id=pool.id)
    db_session.add(penalty)
    db_session.flush()
    history = app_module.PenaltyHistory(penalty_id=penalty.id, new_status='pending')
    event = app_module.NotificationEvent(
        type='penalty_method_question',
        status='queued',
        pool_id=pool.id,
        source_entity='penalty',
        source_entity_id=penalty.id,
    )
    db_session.add_all([history, event])
    db_session.commit()

    response = client.delete(f'/api/penalties/{penalty.id}', headers=auth_headers(admin))

    db_session.refresh(event)
    assert response.status_code == 200
    assert app_module.PenaltyHistory.query.filter_by(penalty_id=penalty.id).count() == 0
    assert event.status == 'cancelled'


def test_shift_block_validation_and_overlap(client, factories, auth_headers):
    admin = factories.user('admin', role='admin', password='secret123')
    factories.pool('Active', active=True)
    shift_date = (app_module._moscow_today() + timedelta(days=2)).isoformat()

    invalid = client.post('/api/blocks', headers=auth_headers(admin), json={
        'date': shift_date, 'time_start': '14:00', 'time_end': '10:00', 'capacity': 0,
    })
    created = client.post('/api/blocks', headers=auth_headers(admin), json={
        'date': shift_date, 'time_start': '10:00', 'time_end': '14:00', 'capacity': 2,
    })
    overlap = client.post('/api/blocks', headers=auth_headers(admin), json={
        'date': shift_date, 'time_start': '13:00', 'time_end': '15:00', 'capacity': 2,
    })

    assert invalid.status_code == 400
    assert created.status_code == 201
    assert overlap.status_code == 409


def test_signup_rejects_overlapping_shift(client, factories, auth_headers, db_session, monkeypatch):
    volunteer = factories.user('volunteer')
    pool = factories.pool('Active', active=True)
    factories.assign(volunteer, pool)
    shift_date = date(2099, 1, 2)
    first = factories.shift_block(pool, shift_date, start='10:00', end='14:00')
    second = factories.shift_block(pool, shift_date, start='13:00', end='16:00')
    db_session.add(app_module.Signup(block_id=first.id, user_id=volunteer.id))
    db_session.commit()
    monkeypatch.setattr(app_module, '_moscow_now', lambda: datetime.combine(date(2099, 1, 1), time(10, 0)))

    response = client.post(f'/api/blocks/{second.id}/signup', headers=auth_headers(volunteer))

    assert response.status_code == 409
    assert response.get_json()['error'] == 'У пользователя уже есть пересекающаяся смена'


def test_disabled_telegram_delivery_is_skipped(factories, db_session, monkeypatch):
    user = factories.user('volunteer', telegram='@volunteer')
    pool = factories.pool('Active', active=True)
    factories.assign(user, pool)
    account = app_module.TelegramAccount(
        user_id=user.id,
        telegram_username='volunteer',
        telegram_chat_id='123',
        is_linked=True,
        delivery_enabled=False,
    )
    event = app_module.NotificationEvent(
        type='manual_broadcast',
        status='queued',
        recipient_user_id=user.id,
        pool_id=pool.id,
        payload='{"text":"test"}',
    )
    db_session.add_all([account, event])
    db_session.commit()
    sent = []
    monkeypatch.setattr(app_module, 'telegram_send_message', lambda *args, **kwargs: sent.append(args))

    result = app_module.process_pending_notifications()

    db_session.refresh(event)
    assert result['skipped'] == 1
    assert event.status == 'skipped'
    assert sent == []


def test_notification_dedupe_is_scoped_by_pool(factories, db_session):
    user = factories.user('volunteer')
    first_pool = factories.pool('First', active=True)
    first = app_module._queue_notification(user, 'test', 'one', 'same-key', pool_id=first_pool.id)
    db_session.commit()
    first_pool.active = False
    second_pool = factories.pool('Second', active=True)
    second = app_module._queue_notification(user, 'test', 'two', 'same-key', pool_id=second_pool.id)
    db_session.commit()

    assert first.id != second.id
    assert first.dedupe_key != second.dedupe_key


def test_only_staff_can_approve_student_event(client, factories, auth_headers, db_session):
    tribe_master = factories.user('master')
    team_lead = factories.user('lead', role='team_lead', password='lead1234')
    pool = factories.pool('Active', active=True)
    factories.assign(tribe_master, pool, pool_role='tribe_master', tribe='Короны')
    student = app_module.Student(nick='student', name='Student', tribe='Короны', pool_id=pool.id)
    db_session.add(student)
    db_session.flush()
    event = app_module.StudentEvent(
        student_id=student.id,
        event_type='education',
        status='pending',
        points=0,
    )
    db_session.add(event)
    db_session.commit()

    forbidden = client.patch(
        f'/api/student-events/{event.id}',
        headers=auth_headers(tribe_master),
        json={'status': 'confirmed'},
    )
    approved = client.patch(
        f'/api/student-events/{event.id}',
        headers=auth_headers(team_lead),
        json={'status': 'confirmed'},
    )

    db_session.refresh(event)
    assert forbidden.status_code == 403
    assert approved.status_code == 200
    assert event.status == 'confirmed'
    assert event.points == app_module.STUDENT_EVENT_POINTS['education']


def test_stale_pool_note_and_broadcast_cannot_be_modified(client, factories, auth_headers, db_session):
    admin = factories.user('admin', role='admin', password='secret123')
    old_pool = factories.pool('Old', active=False)
    factories.pool('Active', active=True)
    note = app_module.DashboardNote(author_id=admin.id, pool_id=old_pool.id, text='Old note')
    broadcast = app_module.Broadcast(author_id=admin.id, pool_id=old_pool.id, text='Old', status='draft')
    db_session.add_all([note, broadcast])
    db_session.commit()

    note_response = client.patch(
        f'/api/notifications/notes/{note.id}',
        headers=auth_headers(admin),
        json={'text': 'Changed'},
    )
    broadcast_response = client.delete(
        f'/api/notifications/broadcasts/{broadcast.id}',
        headers=auth_headers(admin),
    )

    assert note_response.status_code == 409
    assert broadcast_response.status_code == 409


def test_stats_require_access_to_active_pool(client, factories, auth_headers):
    outsider = factories.user('outsider')
    factories.pool('Active', active=True)

    response = client.get('/api/stats', headers=auth_headers(outsider))

    assert response.status_code == 403


def test_duplicate_telegram_username_is_rejected(client, factories, auth_headers):
    admin = factories.user('admin', role='admin', password='secret123')
    factories.user('first', telegram='@same_username')
    second = factories.user('second')

    response = client.patch(
        f'/api/users/{second.id}',
        headers=auth_headers(admin),
        json={'telegram': '@Same_Username'},
    )

    assert response.status_code == 409


def test_internal_google_export_requires_secret(client, factories, monkeypatch):
    pool = factories.pool(
        'Active',
        active=True,
        google_sheet_enabled=True,
        google_sheet_webhook_url='https://script.google.com/macros/s/test/exec',
    )
    monkeypatch.setattr(
        app_module,
        'export_pool_to_google_sheets',
        lambda exported_pool: {'sheets': ['shifts']} if exported_pool.id == pool.id else {},
    )

    forbidden = client.post('/api/internal/google-sheets/export')
    allowed = client.post(
        '/api/internal/google-sheets/export',
        headers={'Authorization': f'Bearer {app_module.INTERNAL_API_SECRET}'},
    )

    assert forbidden.status_code == 403
    assert allowed.status_code == 200
    assert allowed.get_json()['exported'] == [{'pool_id': pool.id, 'sheets': ['shifts']}]


def test_google_sheets_payload_is_scoped_to_pool(factories, db_session):
    first_pool = factories.pool('First', active=True, start_date=date(2026, 7, 20))
    second_pool = factories.pool('Second', active=False, start_date=date(2026, 8, 3))
    first_user = factories.user('first-volunteer')
    second_user = factories.user('second-volunteer')
    factories.assign(first_user, first_pool)
    factories.assign(second_user, second_pool)
    first_block = factories.shift_block(first_pool, date(2026, 7, 20), start='09:00', end='19:00')
    second_block = factories.shift_block(second_pool, date(2026, 8, 3), start='09:00', end='19:00')
    db_session.add_all([
        app_module.Signup(block_id=first_block.id, user_id=first_user.id),
        app_module.Signup(block_id=second_block.id, user_id=second_user.id),
        app_module.StudentPenalty(student_name='first-student', pool_id=first_pool.id),
        app_module.StudentPenalty(student_name='second-student', pool_id=second_pool.id),
    ])
    db_session.commit()

    payload = app_module.build_google_sheets_template_payload(first_pool.id)

    assert payload['pool']['id'] == first_pool.id
    assert [item['nick'] for item in payload['volunteers']] == ['first-volunteer']
    assert [row['id'] for row in payload['shifts']] == [first_block.id]
    assert payload['shifts'][0]['volunteers'] == ['first-volunteer']
    assert [row['student'] for row in payload['penalties']] == ['first-student']


def test_google_sheets_student_event_statuses_match_sheet_validation(factories, db_session):
    pool = factories.pool('Active', active=True, start_date=date(2026, 7, 20))
    tribe_master = factories.user('tribe-master', role='tribe_master')
    student = app_module.Student(nick='student', name='Student', tribe='Короны', pool_id=pool.id)
    db_session.add(student)
    db_session.flush()

    db_session.add_all([
        app_module.StudentEvent(
            student_id=student.id,
            event_type='entertainment',
            event_date=date(2026, 7, 21),
            created_by=tribe_master.id,
            status='pending',
            points=0,
        ),
        app_module.StudentEvent(
            student_id=student.id,
            event_type='education',
            event_date=date(2026, 7, 22),
            created_by=tribe_master.id,
            status='confirmed',
            points=4,
        ),
        app_module.StudentEvent(
            student_id=student.id,
            event_type='entertainment',
            event_date=date(2026, 7, 23),
            created_by=tribe_master.id,
            status='rejected',
            points=0,
        ),
    ])
    db_session.commit()

    payload = app_module.build_google_sheets_template_payload(pool.id)
    exported_statuses = [row['status'] for row in payload['student_events']]

    assert exported_statuses == ['Ожидает', 'Готово', 'FAKE']


def test_pool_google_sheets_configuration_is_staff_only(client, factories, auth_headers):
    admin = factories.user('admin', role='admin', password='secret123')
    volunteer = factories.user('volunteer')
    pool = factories.pool('Active', active=True)

    forbidden = client.patch(
        f'/api/pools/{pool.id}/google-sheets',
        headers=auth_headers(volunteer),
        json={'enabled': False, 'sheet_url': '', 'webhook_url': ''},
    )
    configured = client.patch(
        f'/api/pools/{pool.id}/google-sheets',
        headers=auth_headers(admin),
        json={
            'enabled': True,
            'sheet_url': 'https://docs.google.com/spreadsheets/d/test-sheet/edit',
            'webhook_url': 'https://script.google.com/macros/s/test-script/exec',
        },
    )

    assert forbidden.status_code == 403
    assert configured.status_code == 200
    assert configured.get_json()['enabled'] is True


def test_google_sheets_configuration_rejects_inactive_pool(client, factories, auth_headers):
    admin = factories.user('admin', role='admin', password='secret123')
    factories.pool('Active', active=True)
    inactive_pool = factories.pool('Previous', active=False)

    response = client.patch(
        f'/api/pools/{inactive_pool.id}/google-sheets',
        headers=auth_headers(admin),
        json={'enabled': False, 'sheet_url': '', 'webhook_url': ''},
    )

    assert response.status_code == 409


def test_manual_google_sheets_export_does_not_require_schedule_enabled(
    client, factories, auth_headers, monkeypatch,
):
    admin = factories.user('admin', role='admin', password='secret123')
    pool = factories.pool(
        'Active',
        active=True,
        google_sheet_enabled=False,
        google_sheet_webhook_url='https://script.google.com/macros/s/test/exec',
    )
    monkeypatch.setattr(
        app_module,
        'export_pool_to_google_sheets',
        lambda exported_pool: {'ok': True, 'sheets': ['volunteers', 'shifts']},
    )

    response = client.post(
        f'/api/pools/{pool.id}/google-sheets/export',
        headers=auth_headers(admin),
    )

    assert response.status_code == 200
    assert response.get_json()['sheets'] == ['volunteers', 'shifts']


def test_internal_google_export_skips_inactive_pools(client, factories, monkeypatch):
    active_pool = factories.pool(
        'Active',
        active=True,
        google_sheet_enabled=True,
        google_sheet_webhook_url='https://script.google.com/macros/s/active/exec',
    )
    factories.pool(
        'Inactive',
        active=False,
        google_sheet_enabled=True,
        google_sheet_webhook_url='https://script.google.com/macros/s/inactive/exec',
    )
    exported_pool_ids = []

    def fake_export(exported_pool):
        exported_pool_ids.append(exported_pool.id)
        return {'sheets': ['shifts']}

    monkeypatch.setattr(app_module, 'export_pool_to_google_sheets', fake_export)

    response = client.post(
        '/api/internal/google-sheets/export',
        headers={'Authorization': f'Bearer {app_module.INTERNAL_API_SECRET}'},
    )

    assert response.status_code == 200
    assert exported_pool_ids == [active_pool.id]
