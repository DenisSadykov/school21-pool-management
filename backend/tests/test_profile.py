from io import BytesIO

import app as app_module


def test_update_me_normalizes_telegram_and_updates_unlinked_account(client, factories, auth_headers, db_session):
    user = factories.user('odessabu', role='volunteer', name='Денис')
    db_session.add(app_module.TelegramAccount(
        user_id=user.id,
        telegram_username='old_username',
        is_linked=False,
        delivery_enabled=True,
    ))
    db_session.commit()

    response = client.patch(
        '/api/me',
        headers=auth_headers(user),
        json={'name': 'Денис Садыков', 'telegram': 'DenisSadykov'},
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload['name'] == 'Денис Садыков'
    assert payload['telegram'] == '@DenisSadykov'

    account = db_session.query(app_module.TelegramAccount).filter_by(user_id=user.id).one()
    assert account.telegram_username == 'denissadykov'


def test_update_me_rejects_duplicate_nick(client, factories, auth_headers):
    user = factories.user('odessabu', role='volunteer')
    factories.user('existing_nick', role='volunteer')

    response = client.patch(
        '/api/me',
        headers=auth_headers(user),
        json={'nick': 'existing_nick'},
    )

    assert response.status_code == 409
    assert response.get_json()['error'] == 'Такой ник уже есть'


def test_avatar_upload_rejects_spoofed_image_content(client, factories, auth_headers):
    user = factories.user('avatar-user')

    response = client.post(
        '/api/me/avatar',
        headers=auth_headers(user),
        data={'file': (BytesIO(b'<script>alert(1)</script>'), 'avatar.png', 'image/png')},
        content_type='multipart/form-data',
    )

    assert response.status_code == 400
    assert response.get_json()['error'] == 'Содержимое файла не соответствует формату изображения'


def test_avatar_upload_accepts_matching_png_signature(client, factories, auth_headers):
    user = factories.user('valid-avatar-user')
    png = b'\x89PNG\r\n\x1a\n' + b'valid-test-payload'

    response = client.post(
        '/api/me/avatar',
        headers=auth_headers(user),
        data={'file': (BytesIO(png), 'avatar.png', 'image/png')},
        content_type='multipart/form-data',
    )

    assert response.status_code == 200
