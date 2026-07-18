from datetime import date


def test_tribe_master_sees_only_own_tribe_templates(client, factories, auth_headers):
    pool = factories.pool(name='July Pool', active=True, start_date=date(2026, 7, 20))
    master = factories.user('deer-master', role='tribe_master')
    factories.assign(master, pool, pool_role='tribe_master', tribe='Олени')

    response = client.get('/api/tribe-scripts', headers=auth_headers(master))

    assert response.status_code == 200
    payload = response.get_json()
    assert payload['tribe'] == 'Олени'
    assert payload['pool_name'] == 'July Pool'
    assert payload['summary'] == {'total': 14, 'sent': 0, 'remaining': 14}
    assert all(item['id'].startswith('deer-') for item in payload['templates'])
    assert payload['templates'][1]['variables'][0]['key'] == 'meeting_time'
    recommended_dates = [item['recommended_date'] for item in payload['templates']]
    assert recommended_dates == sorted(recommended_dates)

    dates = {item['id'].removeprefix('deer-'): item['recommended_date'] for item in payload['templates']}
    assert dates['welcome'] == '2026-07-20'
    assert dates['first-meeting'] == '2026-07-20'
    assert dates['event-guide'] == '2026-07-21'
    assert dates['penalties'] == '2026-07-22'
    assert dates['exam-stream'] == '2026-07-22'
    assert dates['exam-morning'] == '2026-07-23'
    assert dates['post-exam-reflection'] == '2026-07-23'
    assert dates['event-progress'] == '2026-07-23'
    assert dates['group-project'] == '2026-07-24'
    assert dates['midpool-confession'] == '2026-07-27'


def test_tribe_master_can_mark_template_sent_and_restore_it(client, factories, auth_headers):
    pool = factories.pool(active=True)
    master = factories.user('ribbon-master', role='tribe_master')
    factories.assign(master, pool, pool_role='tribe_master', tribe='Ленты')
    headers = auth_headers(master)
    template_id = 'ribbons-welcome'

    marked = client.patch(
        f'/api/tribe-scripts/{template_id}',
        json={'sent': True},
        headers=headers,
    )
    assert marked.status_code == 200
    assert marked.get_json()['sent'] is True
    assert marked.get_json()['sent_at']

    refreshed = client.get('/api/tribe-scripts', headers=headers).get_json()
    item = next(template for template in refreshed['templates'] if template['id'] == template_id)
    assert item['sent'] is True
    assert refreshed['summary']['sent'] == 1

    restored = client.patch(
        f'/api/tribe-scripts/{template_id}',
        json={'sent': False},
        headers=headers,
    )
    assert restored.status_code == 200
    assert restored.get_json() == {'template_id': template_id, 'sent': False, 'sent_at': None}


def test_tribe_scripts_are_hidden_from_other_roles(client, factories, auth_headers):
    pool = factories.pool(active=True)
    volunteer = factories.user('volunteer')
    team_lead = factories.user('lead', role='team_lead')
    factories.assign(volunteer, pool, pool_role='volunteer')

    assert client.get('/api/tribe-scripts', headers=auth_headers(volunteer)).status_code == 403
    assert client.get('/api/tribe-scripts', headers=auth_headers(team_lead)).status_code == 403


def test_tribe_master_cannot_update_another_tribes_template(client, factories, auth_headers):
    pool = factories.pool(active=True)
    master = factories.user('crown-master', role='tribe_master')
    factories.assign(master, pool, pool_role='tribe_master', tribe='Короны')

    response = client.patch(
        '/api/tribe-scripts/deer-welcome',
        json={'sent': True},
        headers=auth_headers(master),
    )

    assert response.status_code == 404


def test_sent_status_does_not_carry_into_the_next_pool(client, factories, auth_headers, db_session):
    first_pool = factories.pool(name='June Pool', active=True, start_date=date(2026, 6, 8))
    master = factories.user('returning-master', role='tribe_master')
    factories.assign(master, first_pool, pool_role='tribe_master', tribe='Ленты')
    headers = auth_headers(master)

    marked = client.patch(
        '/api/tribe-scripts/ribbons-welcome',
        json={'sent': True},
        headers=headers,
    )
    assert marked.status_code == 200

    first_pool.active = False
    db_session.commit()
    next_pool = factories.pool(name='July Pool', active=True, start_date=date(2026, 7, 20))
    factories.assign(master, next_pool, pool_role='tribe_master', tribe='Ленты')

    payload = client.get('/api/tribe-scripts', headers=headers).get_json()
    welcome = next(item for item in payload['templates'] if item['id'] == 'ribbons-welcome')
    assert payload['pool_name'] == 'July Pool'
    assert welcome['recommended_date'] == '2026-07-20'
    assert welcome['sent'] is False
    assert payload['summary']['sent'] == 0
