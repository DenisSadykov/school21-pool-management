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
