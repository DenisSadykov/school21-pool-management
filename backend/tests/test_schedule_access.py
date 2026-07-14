from datetime import date, timedelta

import app as app_module


def test_staff_can_disable_self_signup_for_volunteers_and_tribe_masters(
    client,
    factories,
    auth_headers,
    db_session,
):
    admin = factories.user('admin', role='admin', password='secret123')
    volunteer = factories.user('volunteer')
    tribe_master = factories.user('tribe_master')
    pool = factories.pool('Active pool', active=True)
    factories.assign(volunteer, pool, pool_role='volunteer')
    factories.assign(tribe_master, pool, pool_role='tribe_master', tribe='Короны')
    block = factories.shift_block(pool, date.today() + timedelta(days=1))

    initial_signup = client.post(
        f'/api/blocks/{block.id}/signup',
        headers=auth_headers(volunteer),
    )
    disable = client.patch(
        '/api/schedule/settings',
        headers=auth_headers(admin),
        json={'self_signup_enabled': False},
    )
    volunteer_leave = client.delete(
        f'/api/blocks/{block.id}/signup',
        headers=auth_headers(volunteer),
    )
    tribe_signup = client.post(
        f'/api/blocks/{block.id}/signup',
        headers=auth_headers(tribe_master),
    )

    assert initial_signup.status_code == 201
    assert disable.status_code == 200
    assert disable.get_json()['self_signup_enabled'] is False
    assert volunteer_leave.status_code == 403
    assert tribe_signup.status_code == 403
    assert app_module.Signup.query.filter_by(block_id=block.id, user_id=volunteer.id).count() == 1

    schedule = client.get('/api/schedule', headers=auth_headers(volunteer))
    assert schedule.status_code == 200
    assert schedule.get_json()['pool']['self_signup_enabled'] is False


def test_staff_can_manage_signups_while_self_signup_is_disabled(
    client,
    factories,
    auth_headers,
):
    team_lead = factories.user('lead', role='team_lead', password='lead1234')
    volunteer = factories.user('volunteer')
    pool = factories.pool('Active pool', active=True, self_signup_enabled=False)
    factories.assign(volunteer, pool)
    block = factories.shift_block(pool, date.today() + timedelta(days=1))

    assign = client.post(
        f'/api/blocks/{block.id}/signup',
        headers=auth_headers(team_lead),
        json={'user_id': volunteer.id},
    )
    remove = client.delete(
        f'/api/blocks/{block.id}/signup?user_id={volunteer.id}',
        headers=auth_headers(team_lead),
    )

    assert assign.status_code == 201
    assert remove.status_code == 200
