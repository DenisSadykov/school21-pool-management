import app as app_module


def test_penalties_are_forbidden_without_active_pool_access(client, factories, auth_headers):
    outsider = factories.user('outsider')
    factories.pool('Active pool', active=True)

    response = client.get('/api/penalties', headers=auth_headers(outsider))

    assert response.status_code == 403
    assert response.get_json()['error'] == 'У тебя нет доступа к активному бассейну'


def test_volunteer_can_create_penalty_in_accessible_active_pool(client, factories, auth_headers, db_session):
    admin = factories.user('admin', role='admin', password='secret123')
    volunteer = factories.user('volunteer1', role='volunteer', name='Волонтёр')
    pool = factories.pool('Active pool', active=True)
    factories.assign(volunteer, pool)
    factories.assign(admin, pool, pool_role='responsible_admin')
    student = app_module.Student(nick='ivan', name='Ivan Student', pool_id=pool.id)
    db_session.add(student)
    db_session.commit()

    response = client.post(
        '/api/penalties',
        headers=auth_headers(volunteer),
        json={'student_id': student.id, 'description': 'Late'},
    )

    assert response.status_code == 201
    payload = response.get_json()
    assert payload['message'] == 'Штраф добавлен'

    penalty = db_session.query(app_module.StudentPenalty).filter_by(student_id=student.id).one()
    assert penalty.pool_id == pool.id

    notifications = db_session.query(app_module.NotificationEvent).filter_by(source_entity='penalty', source_entity_id=penalty.id).all()
    assert any(event.type == 'penalty_admin_block' and event.recipient_user_id == admin.id for event in notifications)


def test_penalty_creation_reuses_recent_penalty_for_same_student(
    client,
    factories,
    auth_headers,
    db_session,
):
    volunteer = factories.user('volunteer1', role='volunteer', name='Волонтёр')
    pool = factories.pool('Active pool', active=True)
    factories.assign(volunteer, pool)
    student = app_module.Student(nick='duplicate_student', name='Duplicate Student', pool_id=pool.id)
    db_session.add(student)
    db_session.commit()

    first = client.post(
        '/api/penalties',
        headers=auth_headers(volunteer),
        json={'student_id': student.id, 'description': 'Late'},
    )
    second = client.post(
        '/api/penalties',
        headers=auth_headers(volunteer),
        json={'student_id': student.id, 'description': 'Late'},
    )

    assert first.status_code == 201
    assert second.status_code == 200
    assert second.get_json()['duplicate'] is True
    assert second.get_json()['id'] == first.get_json()['id']
    assert db_session.query(app_module.StudentPenalty).filter_by(student_id=student.id).count() == 1


def test_penalty_creation_is_forbidden_without_pool_access(client, factories, auth_headers):
    outsider = factories.user('outsider')
    factories.pool('Active pool', active=True)

    response = client.post(
        '/api/penalties',
        headers=auth_headers(outsider),
        json={'student_name': 'Blocked Student'},
    )

    assert response.status_code == 403
    assert response.get_json()['error'] == 'У тебя нет доступа к активному бассейну'


def test_only_staff_can_delete_completed_penalties(client, factories, auth_headers, db_session):
    admin = factories.user('admin', role='admin', password='secret123')
    team_lead = factories.user('lead', role='team_lead', password='lead1234')
    volunteer = factories.user('volunteer1', role='volunteer')
    pool = factories.pool('Active pool', active=True)
    factories.assign(volunteer, pool)
    penalties = [
        app_module.StudentPenalty(
            student_name=f'completed_{index}',
            volunteer_id=volunteer.id,
            volunteer_name=volunteer.nick,
            pool_id=pool.id,
            workoff_status='unlocked',
            date_worked_off=app_module._utcnow(),
        )
        for index in range(2)
    ]
    db_session.add_all(penalties)
    db_session.flush()
    history = app_module.PenaltyHistory(
        penalty_id=penalties[0].id,
        old_status='awaiting_unlock',
        new_status='unlocked',
    )
    db_session.add(history)
    db_session.commit()
    history_id = history.id

    forbidden = client.delete(
        f'/api/penalties/{penalties[0].id}',
        headers=auth_headers(volunteer),
    )
    assert forbidden.status_code == 403
    assert db_session.get(app_module.StudentPenalty, penalties[0].id) is not None

    admin_delete = client.delete(
        f'/api/penalties/{penalties[0].id}',
        headers=auth_headers(admin),
    )
    lead_delete = client.delete(
        f'/api/penalties/{penalties[1].id}',
        headers=auth_headers(team_lead),
    )

    assert admin_delete.status_code == 200
    assert lead_delete.status_code == 200
    assert db_session.get(app_module.StudentPenalty, penalties[0].id) is None
    assert db_session.get(app_module.StudentPenalty, penalties[1].id) is None
    assert db_session.query(app_module.PenaltyHistory).filter_by(id=history_id).count() == 0


def test_manual_penalty_status_to_overdue_doubles_hours_and_cancels_questions(client, factories, auth_headers, db_session):
    volunteer = factories.user('volunteer1', role='volunteer', name='Волонтёр')
    pool = factories.pool('Active pool', active=True)
    factories.assign(volunteer, pool)

    penalty = app_module.StudentPenalty(
        student_name='Ivan Student',
        volunteer_id=volunteer.id,
        volunteer_name=volunteer.name,
        pool_id=pool.id,
        workoff_status='pending',
        hours=2,
        multiplier=1,
    )
    db_session.add(penalty)
    db_session.flush()
    event = app_module.NotificationEvent(
        type='penalty_method_question',
        status='pending',
        recipient_user_id=volunteer.id,
        pool_id=pool.id,
        source_entity='penalty',
        source_entity_id=penalty.id,
    )
    db_session.add(event)
    db_session.commit()

    response = client.patch(
        f'/api/penalties/{penalty.id}',
        headers=auth_headers(volunteer),
        json={'workoff_status': 'overdue', 'comment': 'Не пришёл на отработку'},
    )

    assert response.status_code == 200
    db_session.refresh(penalty)
    db_session.refresh(event)
    assert penalty.workoff_status == 'overdue'
    assert penalty.multiplier == 2
    assert event.status == 'cancelled'

    history = db_session.query(app_module.PenaltyHistory).filter_by(penalty_id=penalty.id).all()
    assert any(item.new_status == 'overdue' for item in history)


def test_manual_penalty_status_to_awaiting_unlock_notifies_admins_and_cancels_pending(client, factories, auth_headers, db_session):
    admin = factories.user('admin', role='admin', password='secret123')
    volunteer = factories.user('volunteer1', role='volunteer', name='Волонтёр')
    pool = factories.pool('Active pool', active=True)
    factories.assign(volunteer, pool)
    factories.assign(admin, pool, pool_role='responsible_admin')

    penalty = app_module.StudentPenalty(
        student_name='Petr Student',
        volunteer_id=volunteer.id,
        volunteer_name=volunteer.name,
        pool_id=pool.id,
        workoff_status='in_workoff',
    )
    db_session.add(penalty)
    db_session.flush()
    method_event = app_module.NotificationEvent(
        type='penalty_method_question',
        status='pending',
        recipient_user_id=volunteer.id,
        pool_id=pool.id,
        source_entity='penalty',
        source_entity_id=penalty.id,
    )
    workoff_event = app_module.NotificationEvent(
        type='penalty_workoff_check',
        status='pending',
        recipient_user_id=volunteer.id,
        pool_id=pool.id,
        source_entity='penalty',
        source_entity_id=penalty.id,
    )
    db_session.add_all([method_event, workoff_event])
    db_session.commit()

    response = client.patch(
        f'/api/penalties/{penalty.id}',
        headers=auth_headers(volunteer),
        json={'workoff_status': 'awaiting_unlock', 'comment': 'Отработал'},
    )

    assert response.status_code == 200
    db_session.refresh(penalty)
    db_session.refresh(method_event)
    db_session.refresh(workoff_event)
    assert penalty.workoff_status == 'awaiting_unlock'
    assert method_event.status == 'cancelled'
    assert workoff_event.status == 'cancelled'

    admin_events = db_session.query(app_module.NotificationEvent).filter_by(
        type='penalty_admin_unlock',
        source_entity='penalty',
        source_entity_id=penalty.id,
    ).all()
    assert admin_events
    assert any(item.recipient_user_id == admin.id for item in admin_events)

    duplicate_response = client.patch(
        f'/api/penalties/{penalty.id}',
        headers=auth_headers(volunteer),
        json={'workoff_status': 'awaiting_unlock', 'comment': 'Повторное нажатие'},
    )

    assert duplicate_response.status_code == 200
    assert duplicate_response.get_json()['duplicate'] is True
    assert db_session.query(app_module.NotificationEvent).filter_by(
        type='penalty_admin_unlock',
        source_entity='penalty',
        source_entity_id=penalty.id,
    ).count() == len(admin_events)
    assert db_session.query(app_module.PenaltyHistory).filter_by(
        penalty_id=penalty.id,
        new_status='awaiting_unlock',
    ).count() == 1


def test_penalty_notifications_go_only_to_pool_responsibles(client, factories, auth_headers, db_session):
    responsible_admin = factories.user('resp_admin', role='admin', password='secret123')
    unrelated_admin = factories.user('other_admin', role='admin', password='secret123')
    responsible_lead = factories.user('resp_lead', role='team_lead', password='lead1234')
    unrelated_lead = factories.user('other_lead', role='team_lead', password='lead1234')
    volunteer = factories.user('volunteer1', role='volunteer', name='Волонтёр')
    pool = factories.pool('Active pool', active=True)
    factories.assign(volunteer, pool)
    factories.assign(responsible_admin, pool, pool_role='responsible_admin')
    factories.assign(responsible_lead, pool, pool_role='responsible_team_lead')
    student = app_module.Student(nick='responsible_student', name='Only Responsibles', pool_id=pool.id)
    db_session.add(student)
    db_session.commit()

    response = client.post(
        '/api/penalties',
        headers=auth_headers(volunteer),
        json={'student_id': student.id, 'description': 'Late'},
    )

    assert response.status_code == 201

    penalty = db_session.query(app_module.StudentPenalty).filter_by(student_id=student.id).one()
    notifications = db_session.query(app_module.NotificationEvent).filter_by(
        type='penalty_admin_block',
        source_entity='penalty',
        source_entity_id=penalty.id,
    ).all()
    recipients = {event.recipient_user_id for event in notifications}

    assert responsible_admin.id in recipients
    assert responsible_lead.id in recipients
    assert unrelated_admin.id not in recipients
    assert unrelated_lead.id not in recipients


def test_penalty_notifications_skip_responsible_with_notifications_disabled(
    client, factories, auth_headers, db_session,
):
    responsible_admin = factories.user('resp_admin', role='admin', password='secret123')
    muted_lead = factories.user('muted_lead', role='team_lead', password='lead1234')
    volunteer = factories.user('volunteer1', role='volunteer')
    pool = factories.pool('Active pool', active=True)
    factories.assign(volunteer, pool)
    factories.assign(responsible_admin, pool, pool_role='responsible_admin')
    factories.assign(
        muted_lead,
        pool,
        pool_role='responsible_team_lead',
        notifications_enabled=False,
    )
    student = app_module.Student(nick='muted_test', name='Muted Test', pool_id=pool.id)
    db_session.add(student)
    db_session.commit()

    response = client.post(
        '/api/penalties',
        headers=auth_headers(volunteer),
        json={'student_id': student.id, 'description': 'Late'},
    )

    assert response.status_code == 201
    recipients = {
        event.recipient_user_id
        for event in db_session.query(app_module.NotificationEvent).filter_by(
            type='penalty_admin_block',
        ).all()
    }
    assert responsible_admin.id in recipients
    assert muted_lead.id not in recipients


def test_penalty_block_notification_is_queued_without_blocking_request(
    client,
    factories,
    auth_headers,
    db_session,
    monkeypatch,
):
    admin = factories.user('admin', role='admin', password='secret123', telegram='@admin')
    volunteer = factories.user('volunteer1', role='volunteer', name='Волонтёр')
    pool = factories.pool('Active pool', active=True)
    factories.assign(volunteer, pool)
    factories.assign(admin, pool, pool_role='responsible_admin')
    student = app_module.Student(nick='instant_student', name='Instant Student', pool_id=pool.id)
    db_session.add_all([
        student,
        app_module.TelegramAccount(
            user_id=admin.id,
            telegram_username='admin',
            telegram_chat_id='999',
            is_linked=True,
            delivery_enabled=True,
        ),
    ])
    db_session.commit()

    monkeypatch.setattr(app_module, 'TELEGRAM_BOT_TOKEN', 'test-bot-token')
    dispatched_event_ids = []
    monkeypatch.setattr(
        app_module,
        'queue_notification_dispatch',
        lambda events: dispatched_event_ids.extend(event.id for event in events),
    )

    response = client.post(
        '/api/penalties',
        headers=auth_headers(volunteer),
        json={'student_id': student.id, 'description': 'Late'},
    )

    assert response.status_code == 201
    penalty = db_session.query(app_module.StudentPenalty).filter_by(student_id=student.id).one()
    event = db_session.query(app_module.NotificationEvent).filter_by(
        type='penalty_admin_block',
        source_entity_id=penalty.id,
    ).one()
    assert event.status == 'queued'
    assert dispatched_event_ids == [event.id]
