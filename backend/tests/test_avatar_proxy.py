import base64

import pytest
import requests

import app as app_module


SYNTHETIC_SECRET = 'SYNTHETIC_SECRET'
PHOTO_PATH = 'photos/synthetic-avatar.jpg'
PHOTO_URL = 'https://api.telegram.org/file/bot' + SYNTHETIC_SECRET + '/' + PHOTO_PATH
PNG_BYTES = b'\x89PNG\r\n\x1a\nsynthetic-test-image'


@pytest.fixture(autouse=True)
def isolated_avatar_transport(monkeypatch):
    monkeypatch.setattr(app_module, 'TELEGRAM_BOT_TOKEN', SYNTHETIC_SECRET)
    monkeypatch.setattr(app_module, '_telegram_bot_avatar_cache', {
        'bytes': None, 'content_type': None, 'expires_at': None,
    })

    def no_network(*args, **kwargs):
        pytest.fail('Unexpected network request in isolated avatar test')

    monkeypatch.setattr(requests.sessions.Session, 'request', no_network)


def linked_photo_account(user, db_session, photo_url=None, photo_file_id='synthetic-file-id',
                         telegram_user_id=None):
    account = app_module.TelegramAccount(
        user_id=user.id,
        telegram_username='synthetic_avatar',
        is_linked=True,
        photo_file_id=photo_file_id,
        photo_url=photo_url,
        telegram_user_id=telegram_user_id,
    )
    db_session.add(account)
    db_session.commit()
    return account


def test_bot_avatar_downloads_photo_with_expected_calls_and_reuses_cache(client, monkeypatch):
    calls = []

    def telegram_get(method, params=None):
        calls.append((method, params))
        return {
            'getMe': {'id': 123},
            'getUserProfilePhotos': {
                'total_count': 1,
                'photos': [[{'file_id': 'small-photo'}, {'file_id': 'large-photo'}]],
            },
            'getFile': {'file_path': PHOTO_PATH},
        }[method]

    def download(url, **kwargs):
        calls.append(('download', url, kwargs))
        response = requests.Response()
        response.status_code = 200
        response._content = PNG_BYTES
        response.headers['Content-Type'] = 'image/png'
        return response

    monkeypatch.setattr(app_module, 'telegram_get', telegram_get)
    monkeypatch.setattr(requests, 'get', download)

    response = client.get('/api/telegram/bot-avatar')
    assert response.status_code == 200
    assert response.data == PNG_BYTES
    assert response.mimetype == 'image/png'
    assert calls == [
        ('getMe', None),
        ('getUserProfilePhotos', {'user_id': 123, 'limit': 1}),
        ('getFile', {'file_id': 'large-photo'}),
        ('download', PHOTO_URL, {'timeout': 30}),
    ]
    cached = client.get('/api/telegram/bot-avatar')
    assert cached.status_code == 200
    assert cached.data == PNG_BYTES
    assert cached.mimetype == 'image/png'
    assert len(calls) == 4


def test_bot_avatar_without_photo_returns_404(client, monkeypatch):
    def telegram_get(method, params=None):
        if method == 'getMe':
            return {'id': 123}
        assert method == 'getUserProfilePhotos'
        return {'total_count': 0, 'photos': []}

    monkeypatch.setattr(app_module, 'telegram_get', telegram_get)
    response = client.get('/api/telegram/bot-avatar')
    assert response.status_code == 404
    assert response.get_json() == {'error': 'Аватар бота не найден'}


def test_bot_avatar_unconfigured_returns_503(client, monkeypatch):
    monkeypatch.setattr(app_module, 'TELEGRAM_BOT_TOKEN', '')
    response = client.get('/api/telegram/bot-avatar')
    assert response.status_code == 503
    assert response.get_json() == {'error': 'Telegram бот не настроен'}


def test_bot_avatar_transport_failure_returns_safe_502(client, monkeypatch):
    def telegram_get(method, params=None):
        raise requests.ConnectionError('synthetic-transport-error ' + PHOTO_URL)

    monkeypatch.setattr(app_module, 'telegram_get', telegram_get)
    response = client.get('/api/telegram/bot-avatar')
    assert response.status_code == 502
    assert response.get_json() == {'error': 'Не удалось загрузить аватар бота'}
    assert SYNTHETIC_SECRET not in response.get_data(as_text=True)
    assert 'synthetic-transport-error' not in response.get_data(as_text=True)
    assert 'https://' not in response.get_data(as_text=True)


def test_authenticated_user_avatar_returns_stored_image(client, factories, auth_headers, db_session):
    user = factories.user('synthetic-avatar-user')
    photo_url = 'data:image/png;base64,' + base64.b64encode(PNG_BYTES).decode('ascii')
    linked_photo_account(user, db_session, photo_url=photo_url, photo_file_id=None)
    response = client.get('/api/users/{}/avatar'.format(user.id), headers=auth_headers(user))
    assert response.status_code == 200
    assert response.data == PNG_BYTES
    assert response.mimetype == 'image/png'


def test_user_avatar_without_photo_returns_404(client, factories, auth_headers):
    user = factories.user('synthetic-no-avatar-user')
    response = client.get('/api/users/{}/avatar'.format(user.id), headers=auth_headers(user))
    assert response.status_code == 404
    assert response.get_json() == {'error': 'Фото не найдено'}


def test_user_avatar_rejects_anonymous_access(client, factories, db_session):
    user = factories.user('synthetic-private-avatar-user')
    linked_photo_account(user, db_session)
    response = client.get('/api/users/{}/avatar'.format(user.id))
    assert response.status_code == 401


@pytest.mark.parametrize('exception_class', [requests.HTTPError, requests.Timeout, requests.ConnectionError])
def test_user_avatar_transport_errors_are_safe_502_and_rollback(
        client, factories, auth_headers, db_session, monkeypatch, exception_class):
    user = factories.user('synthetic-avatar-failure-user')
    account = linked_photo_account(user, db_session)
    original_file_id = account.photo_file_id
    exception_text = 'synthetic-transport-error ' + PHOTO_URL
    rollbacks = []
    original_rollback = db_session.rollback

    def rollback():
        rollbacks.append(True)
        return original_rollback()

    def download(failed_account):
        # Pending changes must be rolled back when the transport fails.
        failed_account.photo_file_id = 'synthetic-uncommitted-change'
        raise exception_class(exception_text)

    monkeypatch.setattr(app_module, '_download_telegram_photo_bytes', download)
    monkeypatch.setattr(db_session, 'rollback', rollback)
    response = client.get('/api/users/{}/avatar'.format(user.id), headers=auth_headers(user))
    assert response.status_code == 502
    assert response.get_json() == {'error': 'Не удалось получить фото'}
    body = response.get_data(as_text=True)
    assert SYNTHETIC_SECRET not in body
    assert PHOTO_URL not in body
    assert exception_text not in body
    assert 'https://' not in body
    assert rollbacks == [True]
    db_session.refresh(account)
    assert account.photo_file_id == original_file_id


def telegram_http_error(status):
    response = requests.Response()
    response.status_code = status
    response.url = 'https://api.telegram.org/bot' + SYNTHETIC_SECRET + '/getFile'
    return requests.HTTPError('synthetic-telegram-error ' + response.url, response=response)


def user_avatar_request(client, factories, auth_headers, db_session, telegram_user_id='123'):
    user = factories.user('synthetic-refreshed-avatar-user')
    account = linked_photo_account(user, db_session, photo_url='photos/stored-path.jpg',
                                   telegram_user_id=telegram_user_id)
    account.last_photo_sync_at = app_module._utcnow()
    db_session.commit()
    return user, account, '/api/users/{}/avatar'.format(user.id), auth_headers(user)


def photo_metadata(account):
    return (account.photo_file_id, account.photo_url, account.last_photo_sync_at,
            account.is_linked, account.telegram_user_id, account.telegram_chat_id)


def assert_safe_avatar_error(response):
    assert response.status_code == 502
    assert response.get_json() == {'error': 'Не удалось получить фото'}
    body = response.get_data(as_text=True)
    assert SYNTHETIC_SECRET not in body
    assert 'synthetic-telegram-error' not in body
    assert 'synthetic-transport-error' not in body
    assert 'https://' not in body


def test_invalid_stored_file_refreshes_photo_once_without_commits_or_metadata_changes(
        client, factories, auth_headers, db_session, monkeypatch):
    user, account, route, headers = user_avatar_request(client, factories, auth_headers, db_session)
    before = photo_metadata(account)
    user_before = (user.nick, user.name, user.role)
    calls, commits = [], []

    def telegram_get(method, params=None):
        calls.append((method, params))
        if method == 'getFile' and params == {'file_id': 'synthetic-file-id'}:
            raise telegram_http_error(400)
        if method == 'getUserProfilePhotos':
            return {'total_count': 1, 'photos': [[{'file_id': 'fresh-file-id'}]]}
        assert method == 'getFile' and params == {'file_id': 'fresh-file-id'}
        return {'file_path': PHOTO_PATH}

    def download(url, **kwargs):
        calls.append(('download', url, kwargs))
        response = requests.Response()
        response.status_code = 200
        response._content = PNG_BYTES
        response.headers['Content-Type'] = 'image/png'
        return response

    monkeypatch.setattr(app_module, 'telegram_get', telegram_get)
    monkeypatch.setattr(requests, 'get', download)
    monkeypatch.setattr(db_session, 'commit', lambda: commits.append(True))
    response = client.get(route, headers=headers)
    assert response.status_code == 200
    assert response.data == PNG_BYTES and response.mimetype == 'image/png'
    assert calls == [
        ('getFile', {'file_id': 'synthetic-file-id'}),
        ('getUserProfilePhotos', {'user_id': '123', 'limit': 1}),
        ('getFile', {'file_id': 'fresh-file-id'}),
        ('download', PHOTO_URL, {'timeout': 30}),
    ]
    assert not commits
    assert photo_metadata(account) == before
    db_session.refresh(account)
    assert photo_metadata(account) == before
    assert (user.nick, user.name, user.role) == user_before


@pytest.mark.parametrize('telegram_user_id', [None, ''])
def test_invalid_stored_file_without_telegram_id_does_not_refresh(
        client, factories, auth_headers, db_session, monkeypatch, telegram_user_id):
    _, account, route, headers = user_avatar_request(
        client, factories, auth_headers, db_session, telegram_user_id=telegram_user_id)
    before, calls = photo_metadata(account), []

    def telegram_get(method, params=None):
        calls.append(method)
        raise telegram_http_error(400)

    monkeypatch.setattr(app_module, 'telegram_get', telegram_get)
    assert_safe_avatar_error(client.get(route, headers=headers))
    assert calls == ['getFile']
    assert photo_metadata(account) == before


@pytest.mark.parametrize('photos', [
    {'total_count': 1, 'photos': [[{'file_id': 'synthetic-file-id'}]]},
    {'total_count': 1, 'photos': [[{'file_id': ''}]]},
    {'total_count': 1, 'photos': [[{}]]},
    {'total_count': 1, 'photos': [[]]},
    {'total_count': 1, 'photos': []},
    {'total_count': True, 'photos': []},
    {'total_count': 1, 'photos': 'invalid'},
    None,
])
def test_same_or_malformed_refreshed_photo_does_not_loop_or_hide_error(
        client, factories, auth_headers, db_session, monkeypatch, photos):
    _, account, route, headers = user_avatar_request(client, factories, auth_headers, db_session)
    before, calls = photo_metadata(account), []

    def telegram_get(method, params=None):
        calls.append(method)
        if method == 'getFile':
            raise telegram_http_error(400)
        return photos

    monkeypatch.setattr(app_module, 'telegram_get', telegram_get)
    assert_safe_avatar_error(client.get(route, headers=headers))
    assert calls == ['getFile', 'getUserProfilePhotos']
    assert photo_metadata(account) == before


def test_valid_empty_refreshed_photos_return_404_without_metadata_changes(
        client, factories, auth_headers, db_session, monkeypatch):
    _, account, route, headers = user_avatar_request(client, factories, auth_headers, db_session)
    before, calls = photo_metadata(account), []

    def telegram_get(method, params=None):
        calls.append(method)
        if method == 'getFile':
            raise telegram_http_error(400)
        return {'total_count': 0, 'photos': []}

    monkeypatch.setattr(app_module, 'telegram_get', telegram_get)
    response = client.get(route, headers=headers)
    assert response.status_code == 404
    assert response.get_json() == {'error': 'Фото не найдено'}
    assert calls == ['getFile', 'getUserProfilePhotos']
    assert photo_metadata(account) == before


@pytest.mark.parametrize('failure', [
    telegram_http_error(401), telegram_http_error(403), telegram_http_error(429),
    telegram_http_error(500), telegram_http_error(502), telegram_http_error(503),
    requests.Timeout('synthetic-transport-error ' + PHOTO_URL),
    requests.ConnectionError('synthetic-transport-error ' + PHOTO_URL),
    requests.HTTPError('synthetic-transport-error ' + PHOTO_URL),
])
def test_initial_auth_and_transport_errors_never_trigger_refresh(
        client, factories, auth_headers, db_session, monkeypatch, failure):
    _, account, route, headers = user_avatar_request(client, factories, auth_headers, db_session)
    before, calls = photo_metadata(account), []

    def telegram_get(method, params=None):
        calls.append(method)
        raise failure

    monkeypatch.setattr(app_module, 'telegram_get', telegram_get)
    assert_safe_avatar_error(client.get(route, headers=headers))
    assert calls == ['getFile']
    assert photo_metadata(account) == before


@pytest.mark.parametrize('failure', [
    telegram_http_error(400), telegram_http_error(401), telegram_http_error(503),
    requests.Timeout('synthetic-transport-error ' + PHOTO_URL),
    requests.ConnectionError('synthetic-transport-error ' + PHOTO_URL),
])
def test_profile_refresh_failure_preserves_safe_502_and_metadata(
        client, factories, auth_headers, db_session, monkeypatch, failure):
    _, account, route, headers = user_avatar_request(client, factories, auth_headers, db_session)
    before, calls = photo_metadata(account), []

    def telegram_get(method, params=None):
        calls.append(method)
        if method == 'getFile':
            raise telegram_http_error(400)
        raise failure

    monkeypatch.setattr(app_module, 'telegram_get', telegram_get)
    assert_safe_avatar_error(client.get(route, headers=headers))
    assert calls == ['getFile', 'getUserProfilePhotos']
    assert photo_metadata(account) == before


def test_fresh_file_lookup_failure_is_not_retried(
        client, factories, auth_headers, db_session, monkeypatch):
    _, account, route, headers = user_avatar_request(client, factories, auth_headers, db_session)
    before, calls = photo_metadata(account), []

    def telegram_get(method, params=None):
        calls.append((method, params))
        if method == 'getUserProfilePhotos':
            return {'total_count': 1, 'photos': [[{'file_id': 'fresh-file-id'}]]}
        raise telegram_http_error(400)

    monkeypatch.setattr(app_module, 'telegram_get', telegram_get)
    assert_safe_avatar_error(client.get(route, headers=headers))
    assert calls == [
        ('getFile', {'file_id': 'synthetic-file-id'}),
        ('getUserProfilePhotos', {'user_id': '123', 'limit': 1}),
        ('getFile', {'file_id': 'fresh-file-id'}),
    ]
    assert photo_metadata(account) == before


def test_download_http_400_does_not_trigger_profile_refresh(
        client, factories, auth_headers, db_session, monkeypatch):
    _, account, route, headers = user_avatar_request(client, factories, auth_headers, db_session)
    before, calls = photo_metadata(account), []

    def telegram_get(method, params=None):
        calls.append(method)
        return {'file_path': PHOTO_PATH}

    def download(url, **kwargs):
        raise telegram_http_error(400)

    monkeypatch.setattr(app_module, 'telegram_get', telegram_get)
    monkeypatch.setattr(requests, 'get', download)
    assert_safe_avatar_error(client.get(route, headers=headers))
    assert calls == ['getFile']
    assert photo_metadata(account) == before
