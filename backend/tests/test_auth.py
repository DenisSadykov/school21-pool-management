import app as app_module
import pytest


def test_maintenance_blocks_requests_but_keeps_health(client, monkeypatch):
    monkeypatch.setenv('PLATFORM_MAINTENANCE', 'true')
    response = client.post('/api/auth/login', json={'nick': 'admin'})
    assert response.status_code == 503
    assert response.headers['Retry-After'] == '60'
    assert client.get('/api/health').status_code == 200
    monkeypatch.delenv('PLATFORM_MAINTENANCE')
    assert client.post('/api/auth/login', json={}).status_code == 400


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


def test_initial_login_requires_password_and_change(client, factories):
    factories.user('odessabu', password=None)
    assert client.post('/api/auth/login', json={'nick': 'odessabu'}).status_code == 403
    response = client.post('/api/auth/login', json={'nick': 'ODESSABU', 'password': 'odessabu'})
    assert response.status_code == 200
    payload = response.get_json()
    assert payload['user']['must_change_password'] is True
    headers = {'Authorization': f"Bearer {payload['token']}"}
    assert client.get('/api/auth/me', headers=headers).status_code == 200
    assert client.get('/api/dashboard', headers=headers).get_json()['code'] == 'password_change_required'
    assert client.patch('/api/me', headers=headers, json={'nick': 'different'}).status_code == 403
    response = client.post('/api/me/password', headers=headers, json={
        'current_password': 'odessabu', 'new_password': 'personal-pass123'})
    assert response.status_code == 200
    fresh = response.get_json()
    assert fresh['user']['must_change_password'] is False
    assert client.get('/api/auth/me', headers=headers).status_code == 401
    fresh_headers = {'Authorization': f"Bearer {fresh['token']}"}
    assert client.get('/api/auth/me', headers=fresh_headers).status_code == 200
    assert client.post('/api/auth/login', json={'nick': 'odessabu', 'password': 'odessabu'}).status_code == 403
    assert client.post('/api/auth/login', json={'nick': 'odessabu', 'password': 'personal-pass123'}).status_code == 200
    assert client.post('/api/me/password', headers=headers, json={
        'current_password': 'odessabu', 'new_password': 'overwritten123'}).status_code == 401


def test_password_validation_and_existing_passwords(client, factories, auth_headers):
    user = factories.user('longnickname', password=None)
    headers = auth_headers(user)
    for current, new in [('wrong', 'personal123'), ('longnickname', 'short'),
                         ('longnickname', 'LONGNICKNAME'), ('longnickname', ['not-a-string'])]:
        assert client.post('/api/me/password', headers=headers, json={
            'current_password': current, 'new_password': new}).status_code == 400
    existing = factories.user('protected', password='existing123')
    assert client.post('/api/auth/login', json={'nick': 'protected', 'password': 'protected'}).status_code == 403
    assert client.post('/api/auth/login', json={'nick': 'protected', 'password': 'existing123'}).get_json()['user']['must_change_password'] is False
    old = auth_headers(existing)
    result = client.post('/api/me/password', headers=old, json={
        'current_password': 'existing123', 'new_password': 'replacement123'})
    assert result.status_code == 200
    assert client.get('/api/auth/me', headers=old).status_code == 401


def test_legacy_tokens_and_staff_without_password_are_rejected(client, factories):
    user = factories.user('legacy')
    token = app_module.serializer.dumps({'id': user.id, 'role': user.role})
    assert client.get('/api/auth/me', headers={'Authorization': f'Bearer {token}'}).status_code == 401
    factories.user('admin', role='admin', password=None)
    assert client.post('/api/auth/login', json={'nick': 'admin', 'password': 'admin'}).status_code == 403


@pytest.mark.parametrize('role', ['volunteer', 'tribe_master', 'tribe_assistant'])
def test_initial_password_cannot_bypass_role_protected_routes(client, factories, auth_headers, role):
    user = factories.user(f'initial_{role}', role=role, password=None)
    headers = auth_headers(user)
    for route in ['/api/dashboard', '/api/schedule', '/api/users']:
        response = client.get(route, headers=headers)
        assert response.status_code == 403
        assert response.get_json()['code'] == 'password_change_required'


def test_login_rejects_invalid_input(client, factories):
    factories.user('tester')
    for payload in [['invalid'], {'nick': 123}, {'nick': 'tester', 'password': ['invalid']}]:
        assert client.post('/api/auth/login', json=payload).status_code in {400, 403}


def test_auth_me_requires_valid_token(client, factories, auth_headers):
    user = factories.user('lead', role='team_lead', password='lead1234')

    response = client.get('/api/auth/me', headers=auth_headers(user))

    assert response.status_code == 200
    payload = response.get_json()
    assert payload['nick'] == 'lead'
    assert payload['role'] == 'team_lead'


def test_auth_token_is_rejected_in_query_string(client, factories):
    user = factories.user('query-token-user')
    token = app_module.make_token(user)

    response = client.get(f'/api/auth/me?token={token}')

    assert response.status_code == 401


def test_api_responses_disable_shared_caching_and_sniffing(client):
    response = client.get('/api/health')

    assert response.headers['Cache-Control'] == 'no-store'
    assert response.headers['X-Content-Type-Options'] == 'nosniff'
    assert response.headers['X-Frame-Options'] == 'DENY'
    assert response.headers['Referrer-Policy'] == 'no-referrer'


def test_cors_rejects_untrusted_origin(client):
    response = client.get('/api/health', headers={'Origin': 'https://evil.example'})

    assert 'Access-Control-Allow-Origin' not in response.headers


def test_oversized_request_returns_json_error(client, app, monkeypatch):
    monkeypatch.setitem(app.config, 'MAX_CONTENT_LENGTH', 64)

    response = client.post(
        '/api/auth/login',
        data=b'{"nick":"' + (b'x' * 100) + b'"}',
        content_type='application/json',
    )

    assert response.status_code == 413
    assert response.get_json()['error'] == 'Запрос слишком большой'
