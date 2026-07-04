def test_health_returns_ok(client):
    response = client.get('/api/health')

    assert response.status_code == 200
    payload = response.get_json()
    assert payload['status'] == 'ok'
    assert 'timestamp' in payload


def test_admin_login_returns_token_and_user(client, factories):
    factories.user('admin', role='admin', password='secret123', name='Админ')

    response = client.post('/api/auth/login', json={'nick': 'admin', 'password': 'secret123'})

    assert response.status_code == 200
    payload = response.get_json()
    assert payload['token']
    assert payload['user']['nick'] == 'admin'
    assert payload['user']['role'] == 'admin'


def test_volunteer_login_does_not_require_password(client, factories):
    factories.user('odessabu', role='volunteer', name='Денис')

    response = client.post('/api/auth/login', json={'nick': 'odessabu'})

    assert response.status_code == 200
    payload = response.get_json()
    assert payload['user']['role'] == 'volunteer'


def test_auth_me_requires_valid_token(client, factories, auth_headers):
    user = factories.user('lead', role='team_lead', password='lead1234')

    response = client.get('/api/auth/me', headers=auth_headers(user))

    assert response.status_code == 200
    payload = response.get_json()
    assert payload['nick'] == 'lead'
    assert payload['role'] == 'team_lead'
