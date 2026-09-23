import app as app_module


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
