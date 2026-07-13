from datetime import date, timedelta

import app as app_module


def test_volunteer_sees_only_assigned_non_archived_pools(client, factories, auth_headers):
    volunteer = factories.user('vol1')
    visible_pool = factories.pool('Visible pool', active=True, archived=False)
    hidden_pool = factories.pool('Hidden pool', active=False, archived=False)
    archived_pool = factories.pool('Archived pool', active=False, archived=True)

    factories.assign(volunteer, visible_pool)
    factories.assign(volunteer, archived_pool)

    response = client.get('/api/pools', headers=auth_headers(volunteer))

    assert response.status_code == 200
    names = [item['name'] for item in response.get_json()]
    assert 'Visible pool' in names
    assert 'Hidden pool' not in names
    assert 'Archived pool' not in names


def test_schedule_uses_same_active_pool_for_volunteer_and_admin(client, factories, auth_headers):
    admin = factories.user('admin', role='admin', password='secret123')
    volunteer = factories.user('volunteer1', role='volunteer')
    old_pool = factories.pool('Old pool', active=False, archived=False)
    active_pool = factories.pool('Active pool', active=True, archived=False)

    factories.assign(volunteer, old_pool, pool_role='volunteer')
    factories.assign(volunteer, active_pool, pool_role='volunteer')
    factories.shift_block(old_pool, date.today() + timedelta(days=1), start='09:00', end='19:00')
    factories.shift_block(active_pool, date.today() + timedelta(days=2), start='10:00', end='14:00')

    admin_response = client.get('/api/schedule', headers=auth_headers(admin))
    volunteer_response = client.get('/api/schedule', headers=auth_headers(volunteer))

    assert admin_response.status_code == 200
    assert volunteer_response.status_code == 200
    assert admin_response.get_json()['pool']['id'] == active_pool.id
    assert volunteer_response.get_json()['pool']['id'] == active_pool.id
    assert admin_response.get_json()['days'] == volunteer_response.get_json()['days']


def test_active_pool_switch_changes_volunteer_role_and_tribe(client, factories, auth_headers):
    admin = factories.user('admin', role='admin', password='secret123')
    volunteer = factories.user('role_switcher', role='volunteer')
    first_pool = factories.pool('First pool', active=True)
    second_pool = factories.pool('Second pool', active=False)
    factories.assign(volunteer, first_pool, pool_role='tribe_master', tribe='Короны')
    factories.assign(volunteer, second_pool, pool_role='volunteer', tribe=None)

    before = client.get('/api/auth/me', headers=auth_headers(volunteer))
    activate = client.post(f'/api/pools/{second_pool.id}/activate', headers=auth_headers(admin))
    after = client.get('/api/auth/me', headers=auth_headers(volunteer))

    assert before.status_code == 200
    assert before.get_json()['role'] == 'tribe_master'
    assert before.get_json()['tribe'] == 'Короны'
    assert activate.status_code == 200
    assert after.status_code == 200
    assert after.get_json()['role'] == 'volunteer'
    assert after.get_json()['tribe'] is None


def test_old_pool_schedule_and_actions_are_rejected(client, factories, auth_headers):
    admin = factories.user('admin', role='admin', password='secret123')
    volunteer = factories.user('active_only', role='volunteer')
    old_pool = factories.pool('Old pool', active=False)
    active_pool = factories.pool('Active pool', active=True)
    factories.assign(volunteer, old_pool)
    factories.assign(volunteer, active_pool)
    old_block = factories.shift_block(old_pool, date.today() + timedelta(days=1))

    schedule_response = client.get(
        f'/api/schedule?pool_id={old_pool.id}',
        headers=auth_headers(admin),
    )
    signup_response = client.post(
        f'/api/blocks/{old_block.id}/signup',
        headers=auth_headers(volunteer),
    )

    assert schedule_response.status_code == 409
    assert signup_response.status_code == 409


def test_my_shifts_contains_only_active_pool(client, factories, auth_headers, db_session):
    volunteer = factories.user('shift_owner', role='volunteer')
    old_pool = factories.pool('Old pool', active=False)
    active_pool = factories.pool('Active pool', active=True)
    factories.assign(volunteer, old_pool)
    factories.assign(volunteer, active_pool)
    old_block = factories.shift_block(old_pool, date.today() + timedelta(days=1))
    active_block = factories.shift_block(active_pool, date.today() + timedelta(days=2))
    db_session.add_all([
        app_module.Signup(block_id=old_block.id, user_id=volunteer.id),
        app_module.Signup(block_id=active_block.id, user_id=volunteer.id),
    ])
    db_session.commit()

    response = client.get('/api/me/shifts', headers=auth_headers(volunteer))

    assert response.status_code == 200
    assert [item['id'] for item in response.get_json()] == [active_block.id]


def test_switching_pool_cancels_old_pool_notifications(client, factories, auth_headers, db_session):
    admin = factories.user('admin', role='admin', password='secret123')
    old_pool = factories.pool('Old pool', active=True)
    next_pool = factories.pool('Next pool', active=False)
    event = app_module.NotificationEvent(
        type='shift_reminder_volunteer',
        pool_id=old_pool.id,
        status='queued',
        dedupe_key='old-pool-event',
    )
    db_session.add(event)
    db_session.commit()

    response = client.post(f'/api/pools/{next_pool.id}/activate', headers=auth_headers(admin))
    db_session.refresh(event)

    assert response.status_code == 200
    assert event.status == 'cancelled'
    assert event.cancelled_at is not None


def test_team_lead_can_be_added_as_pool_responsible(client, factories, auth_headers):
    admin = factories.user('admin', role='admin', password='secret123')
    team_lead = factories.user('lead', role='team_lead', password='lead1234', telegram='@lead_tg')
    pool = factories.pool('July Pool')

    response = client.post(
        f'/api/pools/{pool.id}/responsibles',
        headers=auth_headers(admin),
        json={'user_id': team_lead.id},
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload['message'] == 'Ответственный добавлен'
    assert any(
        item['nick'] == 'lead' and item['role'] == 'team_lead'
        for item in payload['responsibles']
    )


def test_responsibles_are_not_shown_in_pool_volunteers_list(client, factories, auth_headers):
    admin = factories.user('admin', role='admin', password='secret123')
    team_lead = factories.user('lead', role='team_lead', password='lead1234')
    volunteer = factories.user('volunteer1', role='volunteer')
    pool = factories.pool('Pool')

    factories.assign(team_lead, pool, pool_role='responsible_team_lead')
    factories.assign(volunteer, pool, pool_role='volunteer')

    response = client.get(f'/api/pools/{pool.id}/volunteers', headers=auth_headers(admin))

    assert response.status_code == 200
    nicks = [item['nick'] for item in response.get_json()]
    assert 'volunteer1' in nicks
    assert 'lead' not in nicks


def test_manual_broadcast_targets_only_users_linked_to_pool(client, factories, auth_headers, db_session):
    admin = factories.user('admin', role='admin', password='secret123')
    responsible_lead = factories.user('lead', role='team_lead', password='lead1234', telegram='@lead_tg')
    unrelated_lead = factories.user('other_lead', role='team_lead', password='lead1234', telegram='@other_lead_tg')
    volunteer = factories.user('volunteer1', role='volunteer', telegram='@volunteer_tg')
    outsider = factories.user('outsider', role='volunteer', telegram='@outsider_tg')
    pool = factories.pool('Broadcast pool', active=True)

    factories.assign(admin, pool, pool_role='responsible_admin')
    factories.assign(responsible_lead, pool, pool_role='responsible_team_lead')
    factories.assign(volunteer, pool)

    response = client.post(
        '/api/notifications/broadcasts',
        headers=auth_headers(admin),
        json={'text': 'Тестовая рассылка', 'filters': {}},
    )

    assert response.status_code == 201
    recipients = {
        event.recipient_user_id
        for event in db_session.query(app_module.NotificationEvent).filter_by(type='manual_broadcast', pool_id=pool.id).all()
    }
    assert admin.id in recipients
    assert responsible_lead.id in recipients
    assert volunteer.id in recipients
    assert unrelated_lead.id not in recipients
    assert outsider.id not in recipients


def test_create_and_update_volunteer_normalize_telegram_username(client, factories, auth_headers):
    admin = factories.user('admin', role='admin', password='secret123')

    create_response = client.post(
        '/api/volunteers',
        headers=auth_headers(admin),
        json={'nick': 'newvol', 'name': 'Новый', 'telegram': '@NewVolunteer'},
    )

    assert create_response.status_code == 201
    payload = create_response.get_json()
    assert payload['telegram'] == '@NewVolunteer'

    update_response = client.patch(
        f"/api/volunteers/{payload['id']}",
        headers=auth_headers(admin),
        json={'telegram': '@UpdatedVolunteer'},
    )

    assert update_response.status_code == 200
    assert update_response.get_json()['telegram'] == '@UpdatedVolunteer'


def test_admin_can_create_pool_invite_link(client, factories, auth_headers):
    admin = factories.user('admin', role='admin', password='secret123')
    pool = factories.pool('Invite pool', active=True, archived=False)

    response = client.post(
        f'/api/pools/{pool.id}/invite-link',
        headers=auth_headers(admin),
        json={'max_uses': 3, 'expires_at': '2099-01-01T12:00'},
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload['message'] == 'Инвайт-ссылка обновлена'
    assert payload['invite']['is_active'] is True
    assert payload['invite']['token']
    assert payload['invite']['invite_url'].endswith(payload['invite']['token'])
    assert payload['invite']['max_uses'] == 3
    assert payload['invite']['expires_at'].startswith('2099-01-01T12:00')


def test_user_can_accept_pool_invite_link(client, factories, auth_headers):
    admin = factories.user('admin', role='admin', password='secret123')
    volunteer = factories.user('joinme', role='volunteer')
    pool = factories.pool('Join pool', active=True, archived=False)

    create_response = client.post(f'/api/pools/{pool.id}/invite-link', headers=auth_headers(admin))
    token = create_response.get_json()['invite']['token']

    response = client.post(f'/api/invites/{token}/accept', headers=auth_headers(volunteer))

    assert response.status_code == 200
    payload = response.get_json()
    assert payload['already_joined'] is False
    assert payload['pool']['id'] == pool.id
    assert payload['user']['role'] == 'volunteer'

    membership = app_module.PoolVolunteer.query.filter_by(pool_id=pool.id, user_id=volunteer.id).first()
    assert membership is not None
    assert membership.pool_role == 'volunteer'


def test_pool_invite_link_respects_max_uses(client, factories, auth_headers):
    admin = factories.user('admin', role='admin', password='secret123')
    first = factories.user('first_joiner', role='volunteer')
    second = factories.user('second_joiner', role='volunteer')
    pool = factories.pool('Limited pool', active=True, archived=False)

    create_response = client.post(
        f'/api/pools/{pool.id}/invite-link',
        headers=auth_headers(admin),
        json={'max_uses': 1},
    )
    token = create_response.get_json()['invite']['token']

    first_response = client.post(f'/api/invites/{token}/accept', headers=auth_headers(first))
    assert first_response.status_code == 200

    second_response = client.post(f'/api/invites/{token}/accept', headers=auth_headers(second))
    assert second_response.status_code == 410
    assert second_response.get_json()['error'] == 'Лимит входов по этой ссылке уже исчерпан'


def test_delete_pool_cascades_related_records(client, factories, auth_headers, db_session):
    admin = factories.user('admin', role='admin', password='secret123')
    volunteer = factories.user('volunteer1', role='volunteer')
    pool = factories.pool('Archive pool', active=False, archived=True)
    factories.assign(volunteer, pool, pool_role='volunteer')

    generation = app_module.ScheduleGeneration(pool_id=pool.id, created_by=admin.id, end_date=date.today() + timedelta(days=14))
    db_session.add(generation)
    db_session.commit()

    block = app_module.ShiftBlock(
        pool_id=pool.id,
        date=date.today() + timedelta(days=1),
        time_start='10:00',
        time_end='14:00',
        generation_id=generation.id,
    )
    db_session.add(block)
    db_session.commit()

    db_session.add(app_module.Signup(block_id=block.id, user_id=volunteer.id))
    student = app_module.Student(nick='penalty_student', name='Penalty Student', pool_id=pool.id)
    db_session.add(student)
    db_session.commit()

    penalty = app_module.StudentPenalty(
        student_name=student.name,
        volunteer_id=volunteer.id,
        volunteer_name=volunteer.name,
        pool_id=pool.id,
        description='Late',
    )
    db_session.add(penalty)
    db_session.commit()

    db_session.add(app_module.PenaltyHistory(penalty_id=penalty.id, new_status='pending', actor_id=admin.id))
    db_session.add(app_module.DashboardNote(author_id=admin.id, pool_id=pool.id, text='Pool note'))
    event = app_module.NotificationEvent(
        type='manual_broadcast',
        recipient_user_id=volunteer.id,
        pool_id=pool.id,
        status='pending',
    )
    db_session.add(event)
    db_session.commit()
    db_session.add(app_module.NotificationDelivery(notification_id=event.id, user_id=volunteer.id, delivery_status='pending'))
    db_session.commit()

    response = client.delete(f'/api/pools/{pool.id}', headers=auth_headers(admin))

    assert response.status_code == 200
    assert response.get_json()['message'] == 'Бассейн удалён'
    assert db_session.get(app_module.Pool, pool.id) is None
    assert db_session.query(app_module.ShiftBlock).count() == 0
    assert db_session.query(app_module.ScheduleGeneration).count() == 0
    assert db_session.query(app_module.Signup).count() == 0
    assert db_session.query(app_module.Student).count() == 0
    assert db_session.query(app_module.StudentPenalty).count() == 0
    assert db_session.query(app_module.PenaltyHistory).count() == 0
    assert db_session.query(app_module.NotificationEvent).count() == 0
    assert db_session.query(app_module.NotificationDelivery).count() == 0
    assert db_session.query(app_module.DashboardNote).count() == 0
