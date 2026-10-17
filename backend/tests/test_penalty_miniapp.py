import hashlib
import hmac
import json
import time
from datetime import timedelta
from urllib.parse import urlencode

import pytest

import app as platform
from penalty_miniapp import INIT_DATA_MAX_AGE, validate_telegram_init_data


ROOT = '/api/penalty-miniapp'


def signed_init(user_id=712345, **extra):
    values = {'auth_date': str(int(time.time())), 'query_id': 'synthetic-test-query',
              'user': json.dumps({'id': user_id, 'first_name': 'Synthetic', 'username': 'test_user'})}
    values.update(extra)
    key = hmac.new(b'WebAppData', b'synthetic-bot-token', hashlib.sha256).digest()
    check = '\n'.join(f'{key}={value}' for key, value in sorted(values.items()))
    values['hash'] = hmac.new(key, check.encode(), hashlib.sha256).hexdigest()
    return urlencode(values)


@pytest.fixture()
def workoff(factories, db_session, auth_headers, monkeypatch):
    user = factories.user('demo_volunteer')
    pool = factories.pool('Mini App Pool', active=True)
    factories.assign(user, pool)
    student = platform.Student(nick='demo_peer', name='Demo', pool_id=pool.id)
    db_session.add(student)
    db_session.flush()
    penalty = platform.StudentPenalty(student_id=student.id, student_name=student.nick, pool_id=pool.id,
                                      volunteer_id=user.id, hours=2, multiplier=1, workoff_status='pending')
    db_session.add(penalty)
    db_session.commit()
    monkeypatch.setattr(platform, 'TELEGRAM_BOT_TOKEN', 'synthetic-bot-token')
    return user, pool, penalty, auth_headers(user)


def start(client, penalty, headers):
    spun = client.post(f'{ROOT}/penalties/{penalty.id}/spin', headers=headers, json={})
    assert spun.status_code == 200, spun.get_json()
    token = spun.get_json()['draft_token']
    response = client.post(f'{ROOT}/penalties/{penalty.id}/commit', headers=headers, json={'draft_token': token})
    assert response.status_code == 200, response.get_json()
    return response.get_json(), token


def test_telegram_hmac_validation():
    assert validate_telegram_init_data(signed_init(), 'synthetic-bot-token')['id'] == 712345


@pytest.mark.parametrize('raw', [
    'bad-query', signed_init() + '&auth_date=123', signed_init().replace('Synthetic', 'Intruder'),
    signed_init(auth_date=str(int(time.time()) - INIT_DATA_MAX_AGE - 5)),
    signed_init(auth_date=str(int(time.time()) + 90)),
    signed_init(user=json.dumps({'id': '712345'})),
    signed_init(user=json.dumps({'id': True})),
    signed_init(user=json.dumps({'id': 712345, 'is_bot': True})),
])
def test_telegram_rejects_tampered_stale_duplicate_or_invalid_identity(raw):
    with pytest.raises(ValueError):
        validate_telegram_init_data(raw, 'synthetic-bot-token')


def test_miniapp_login_is_bound_to_linked_numeric_identity(client, workoff, db_session):
    user, _, _, _ = workoff
    db_session.add(platform.TelegramAccount(user_id=user.id, telegram_username='old_username',
                                           telegram_user_id='712345', is_linked=True))
    db_session.commit()
    login = client.post(f'{ROOT}/auth', json={'init_data': signed_init()})
    assert login.status_code == 200
    headers = {'Authorization': 'MiniApp ' + login.get_json()['token']}
    assert client.get(ROOT, headers=headers).status_code == 200
    assert client.get('/api/auth/me', headers=headers).status_code == 401
    account = platform.TelegramAccount.query.filter_by(user_id=user.id).one()
    account.is_linked = False
    db_session.commit()
    assert client.get(ROOT, headers=headers).status_code == 401


def test_same_username_without_numeric_link_cannot_log_in(client, workoff, db_session):
    user, _, _, _ = workoff
    db_session.add(platform.TelegramAccount(user_id=user.id, telegram_username='test_user',
                                           telegram_user_id='999999', is_linked=True))
    db_session.commit()
    assert client.post(f'{ROOT}/auth', json={'init_data': signed_init()}).status_code == 403


def telegram_headers(client, user, db_session):
    db_session.add(platform.TelegramAccount(user_id=user.id, telegram_username='test_user',
                                           telegram_user_id='712345', is_linked=True))
    db_session.commit()
    login = client.post(f'{ROOT}/auth', json={'init_data': signed_init()})
    assert login.status_code == 200
    return {'Authorization': 'MiniApp ' + login.get_json()['token']}


def test_platform_exchange_uses_linked_user_and_live_permissions(client, workoff, db_session):
    user, _, _, _ = workoff
    headers = telegram_headers(client, user, db_session)
    response = client.post(f'{ROOT}/platform-session', headers=headers,
                           json={'id': 999, 'role': 'admin', 'telegram_id': 999})
    assert response.status_code == 200
    assert response.headers['Cache-Control'] == 'no-store'
    payload = response.get_json()
    assert payload['user']['id'] == user.id
    assert payload['user']['role'] == 'volunteer'
    full_headers = {'Authorization': 'Bearer ' + payload['token']}
    me = client.get('/api/auth/me', headers=full_headers)
    assert me.status_code == 200
    assert me.get_json()['id'] == user.id
    assert client.get('/api/notifications/overview', headers=full_headers).status_code == 403
    assert platform.serializer.loads(payload['token'])['telegram_id'] == 712345


@pytest.mark.parametrize('change', ['unlink', 'relink', 'password', 'deactivate', 'membership'])
def test_platform_exchange_rechecks_revocation(client, workoff, db_session, change):
    user, pool, _, _ = workoff
    headers = telegram_headers(client, user, db_session)
    if change == 'unlink':
        platform.TelegramAccount.query.filter_by(user_id=user.id).one().is_linked = False
    elif change == 'relink':
        platform.TelegramAccount.query.filter_by(user_id=user.id).one().telegram_user_id = '999999'
    elif change == 'password':
        user.password_hash = 'changed-credential-digest'
    elif change == 'deactivate':
        user.active = False
    else:
        platform.PoolVolunteer.query.filter_by(user_id=user.id, pool_id=pool.id).delete()
    db_session.commit()
    assert client.post(f'{ROOT}/platform-session', headers=headers, json={}).status_code in {401, 403}


@pytest.mark.parametrize('change', ['unlink', 'relink', 'password', 'deactivate'])
def test_telegram_platform_session_remains_revocable(client, workoff, db_session, change):
    user, _, _, _ = workoff
    headers = telegram_headers(client, user, db_session)
    token = client.post(f'{ROOT}/platform-session', headers=headers, json={}).get_json()['token']
    if change == 'unlink':
        platform.TelegramAccount.query.filter_by(user_id=user.id).one().is_linked = False
    elif change == 'relink':
        platform.TelegramAccount.query.filter_by(user_id=user.id).one().telegram_user_id = '999999'
    elif change == 'password':
        user.password_hash = 'changed-credential-digest'
    else:
        user.active = False
    db_session.commit()
    assert client.get('/api/auth/me', headers={'Authorization': 'Bearer ' + token}).status_code == 401


def test_platform_exchange_rejects_anonymous_forged_and_ordinary_bearer(client, workoff):
    _, _, _, headers = workoff
    assert client.post(f'{ROOT}/platform-session', json={}).status_code == 401
    assert client.post(f'{ROOT}/platform-session', json={}, headers={'Authorization': 'MiniApp forged'}).status_code == 401
    assert client.post(f'{ROOT}/platform-session', json={}, headers=headers).status_code == 401


def test_platform_exchange_does_not_bypass_first_password_change(client, workoff, db_session, monkeypatch):
    user, _, _, _ = workoff
    headers = telegram_headers(client, user, db_session)
    monkeypatch.setattr(platform, 'must_change_password', lambda current: True)
    response = client.post(f'{ROOT}/platform-session', headers=headers, json={})
    assert response.status_code == 403
    assert response.get_json()['code'] == 'password_change_required'


def test_telegram_login_requires_valid_signature(client, workoff):
    response = client.post(f'{ROOT}/auth', json={'init_data': signed_init().replace('Synthetic', 'Fake')})
    assert response.status_code == 401


def test_initial_password_and_membership_are_not_bypassed(client, workoff, db_session):
    user, _, _, headers = workoff
    user.password_hash = None
    db_session.add(platform.TelegramAccount(user_id=user.id, telegram_username='test_user',
                                           telegram_user_id='712345', is_linked=True))
    db_session.commit()
    response = client.post(f'{ROOT}/auth', json={'init_data': signed_init()})
    assert response.status_code == 403
    assert response.get_json()['code'] == 'password_change_required'


def test_bootstrap_is_private_and_current_pool_only(client, workoff, factories, auth_headers, db_session):
    _, _, penalty, headers = workoff
    old_pool = factories.pool('Old pool')
    old = platform.StudentPenalty(student_name='private_old_student', pool_id=old_pool.id)
    db_session.add(old)
    db_session.commit()
    assert client.get(ROOT).status_code == 401
    outsider = factories.user('outsider')
    assert client.get(ROOT, headers=auth_headers(outsider)).status_code == 403
    payload = client.get(ROOT, headers=headers).get_json()
    assert [item['id'] for item in payload['penalties']] == [penalty.id]
    assert client.get(f'{ROOT}/penalties/{old.id}', headers=headers).status_code == 404


def test_roulette_numbers_restart_per_pool_and_include_completed_records(client, workoff, factories, db_session):
    _, pool, first, headers = workoff
    previous_pool = factories.pool('Previous numbered pool')
    db_session.add(platform.StudentPenalty(id=100, student_name='old_peer', pool_id=previous_pool.id))
    first.workoff_status = 'done'
    second = platform.StudentPenalty(id=101, student_name='current_peer', pool_id=pool.id, workoff_status='pending')
    db_session.add(second)
    db_session.commit()
    data = client.get(ROOT, headers=headers).get_json()['penalties']
    assert [(p['id'], p['pool_number']) for p in data] == [(101, 2)]
    assert client.get(f'{ROOT}/penalties/101', headers=headers).get_json()['penalty']['pool_number'] == 2
    pool.active = False
    db_session.commit()
    new_pool = factories.pool('New numbered pool', active=True)
    user = workoff[0]
    factories.assign(user, new_pool)
    db_session.add(platform.StudentPenalty(id=102, student_name='new_peer', pool_id=new_pool.id, workoff_status='pending'))
    db_session.commit()
    data = client.get(ROOT, headers=headers).get_json()['penalties']
    assert [(p['id'], p['pool_number']) for p in data] == [(102, 1)]


def test_preview_and_reroll_do_not_change_penalty_or_start_timer(client, workoff, db_session):
    _, pool, penalty, headers = workoff
    response = client.post(f'{ROOT}/penalties/{penalty.id}/spin', headers=headers, json={})
    key = response.get_json()['task']['id']
    rerolled = client.post(f'{ROOT}/penalties/{penalty.id}/spin', headers=headers, json={'exclude_keys': [key]})
    assert rerolled.get_json()['task']['id'] != key
    db_session.refresh(penalty)
    assert penalty.workoff_status == 'pending'
    assert penalty.date_worked_off is None
    assert penalty.pool_id == pool.id
    assert platform.PenaltyWorkoffSession.query.count() == 0
    assert platform.StudentPenalty.query.count() == 1


def test_custom_task_is_only_started_on_commit_and_retries_are_idempotent(client, workoff, db_session):
    user, pool, penalty, headers = workoff
    description = 'Помочь подготовить аудиторию\nНе трогать личные вещи.'
    preview = client.post(f'{ROOT}/penalties/{penalty.id}/custom-preview', headers=headers,
                          json={'description': description, 'hours': 0, 'status': 'completed'})
    assert preview.status_code == 200
    assert platform.PenaltyWorkoffSession.query.count() == 0
    assert penalty.workoff_status == 'pending'
    token = preview.get_json()['draft_token']
    committed = client.post(f'{ROOT}/penalties/{penalty.id}/commit', headers=headers, json={'draft_token': token})
    assert committed.status_code == 200
    data = committed.get_json()['penalty']
    assert data['pool_id'] == pool.id
    assert data['workoff_status'] == 'in_workoff'
    assert data['session']['duration_seconds'] == 7200
    task = data['session']['current_task']
    assert task['description'] == description
    assert task['assigned_by_nick'] == user.nick
    assert task['task_key'].startswith('custom-')
    repeated = client.post(f'{ROOT}/penalties/{penalty.id}/commit', headers=headers, json={'draft_token': token})
    assert repeated.get_json()['duplicate'] is True
    assert platform.PenaltyWorkoffTask.query.count() == 1
    assert repeated.get_json()['penalty']['session']['ends_at'] == data['session']['ends_at']
    assert client.post(f'{ROOT}/penalties/{penalty.id}/finish', headers=headers,
                       json={'session_id': data['session']['id']}).status_code == 409


@pytest.mark.parametrize('description', [None, '', '  ', 'x', 'x' * 1001, [], 123])
def test_custom_task_rejects_invalid_text_without_writes(client, workoff, description):
    _, _, penalty, headers = workoff
    response = client.post(f'{ROOT}/penalties/{penalty.id}/custom-preview', headers=headers,
                           json={'description': description})
    assert response.status_code == 400
    assert platform.PenaltyWorkoffTask.query.count() == 0


def test_custom_preview_is_private_and_cannot_replace_live_task(client, workoff, factories, auth_headers):
    _, pool, penalty, headers = workoff
    assert client.post(f'{ROOT}/penalties/{penalty.id}/custom-preview', json={'description': 'Моя идея'}).status_code == 401
    draft = client.post(f'{ROOT}/penalties/{penalty.id}/custom-preview', headers=headers,
                        json={'description': 'Моя идея'}).get_json()['draft_token']
    other = factories.user('other_custom_volunteer')
    factories.assign(other, pool)
    assert client.post(f'{ROOT}/penalties/{penalty.id}/commit', headers=auth_headers(other),
                       json={'draft_token': draft}).status_code == 403
    started, _ = start(client, penalty, headers)
    assert client.post(f'{ROOT}/penalties/{penalty.id}/custom-preview', headers=headers,
                       json={'description': 'Моя новая идея'}).status_code == 409
    assert client.post(f'{ROOT}/penalties/{penalty.id}/commit', headers=headers,
                       json={'draft_token': draft}).status_code == 409
    assert platform.PenaltyWorkoffTask.query.count() == 1


def test_custom_task_preserves_existing_legacy_timer(client, workoff, db_session):
    _, _, penalty, headers = workoff
    penalty.workoff_status = 'in_workoff'
    penalty.date_worked_off = platform._utcnow() - timedelta(minutes=40)
    db_session.commit()
    expected_end = penalty.date_worked_off + timedelta(hours=2)
    preview = client.post(f'{ROOT}/penalties/{penalty.id}/custom-preview', headers=headers,
                          json={'description': 'Помочь с навигацией'})
    assert preview.status_code == 200
    assert platform.PenaltyWorkoffSession.query.count() == 0
    response = client.post(f'{ROOT}/penalties/{penalty.id}/commit', headers=headers,
                           json={'draft_token': preview.get_json()['draft_token']})
    assert response.status_code == 200
    assert platform.PenaltyWorkoffSession.query.one().ends_at == expected_end


def test_confirmation_starts_once_and_repeat_does_not_reset_time(client, workoff, db_session):
    _, pool, penalty, headers = workoff
    first, token = start(client, penalty, headers)
    retry = client.post(f'{ROOT}/penalties/{penalty.id}/commit', headers=headers, json={'draft_token': token})
    assert retry.status_code == 200
    assert retry.get_json()['duplicate'] is True
    session = first['penalty']['session']
    assert retry.get_json()['penalty']['session']['ends_at'] == session['ends_at']
    db_session.refresh(penalty)
    assert penalty.workoff_status == 'in_workoff'
    assert penalty.pool_id == pool.id
    assert penalty.hours * penalty.multiplier == 2
    assert platform.PenaltyWorkoffSession.query.count() == 1
    assert platform.PenaltyWorkoffTask.query.count() == 1


def test_two_independent_previews_cannot_start_twice(client, workoff):
    _, _, penalty, headers = workoff
    tokens = [client.post(f'{ROOT}/penalties/{penalty.id}/spin', headers=headers, json={}).get_json()['draft_token'] for _ in range(2)]
    first = client.post(f'{ROOT}/penalties/{penalty.id}/commit', headers=headers, json={'draft_token': tokens[0]})
    second = client.post(f'{ROOT}/penalties/{penalty.id}/commit', headers=headers, json={'draft_token': tokens[1]})
    assert first.status_code == 200
    assert second.status_code == 409
    assert platform.PenaltyWorkoffSession.query.count() == 1


def test_draft_is_bound_to_volunteer(client, workoff, factories, auth_headers):
    _, pool, penalty, headers = workoff
    other = factories.user('another_volunteer')
    factories.assign(other, pool)
    draft = client.post(f'{ROOT}/penalties/{penalty.id}/spin', headers=headers, json={}).get_json()['draft_token']
    denied = client.post(f'{ROOT}/penalties/{penalty.id}/commit', headers=auth_headers(other), json={'draft_token': draft})
    assert denied.status_code == 403


@pytest.mark.parametrize('action,expected', [('complete', 'completed'), ('replace', 'unavailable')])
def test_short_tasks_and_replacement_preserve_shared_timer_and_history(client, workoff, action, expected):
    _, _, penalty, headers = workoff
    first, _ = start(client, penalty, headers)
    session = first['penalty']['session']
    old_task = session['current_task']
    operation = {'action': action, 'task_id': old_task['id'], 'request_id': f'synthetic-{action}-request-01'}
    response = client.post(f'{ROOT}/penalties/{penalty.id}/task-action', headers=headers, json=operation)
    assert response.status_code == 200
    state = response.get_json()['penalty']['session']
    assert state['ends_at'] == session['ends_at']
    assert state['current_task']['id'] != old_task['id']
    assert state['tasks'][0]['status'] == expected
    assert response.get_json()['penalty']['workoff_status'] == 'in_workoff'
    retry = client.post(f'{ROOT}/penalties/{penalty.id}/task-action', headers=headers, json=operation)
    assert retry.get_json()['duplicate'] is True
    assert len(retry.get_json()['penalty']['session']['tasks']) == 2
    stale = {**operation, 'request_id': 'different-volunteer-request'}
    assert client.post(f'{ROOT}/penalties/{penalty.id}/task-action', headers=headers, json=stale).status_code == 409


def test_finish_before_deadline_is_rejected_and_no_auto_unlock(client, workoff, db_session):
    _, _, penalty, headers = workoff
    first, _ = start(client, penalty, headers)
    session_id = first['penalty']['session']['id']
    assert client.post(f'{ROOT}/penalties/{penalty.id}/finish', headers=headers, json={'session_id': session_id}).status_code == 409
    assert client.patch(f'/api/penalties/{penalty.id}', headers=headers, json={'workoff_status': 'awaiting_unlock'}).status_code == 409
    session = db_session.get(platform.PenaltyWorkoffSession, session_id)
    session.started_at -= timedelta(hours=3)
    session.ends_at -= timedelta(hours=3)
    db_session.commit()
    state = client.get(f'{ROOT}/penalties/{penalty.id}', headers=headers).get_json()
    assert state['penalty']['workoff_status'] == 'in_workoff'
    response = client.post(f'{ROOT}/penalties/{penalty.id}/finish', headers=headers, json={'session_id': session_id})
    assert response.status_code == 200
    assert response.get_json()['penalty']['workoff_status'] == 'awaiting_unlock'
    assert response.get_json()['penalty']['completed_hours'] == 2
    assert client.post(f'{ROOT}/penalties/{penalty.id}/finish', headers=headers, json={'session_id': session_id}).get_json()['duplicate'] is True


def test_four_hour_penalty_needs_two_sessions_and_keeps_original_hours(client, workoff, db_session):
    _, _, penalty, headers = workoff
    penalty.multiplier = 2
    db_session.commit()
    for round_index in range(2):
        first, _ = start(client, penalty, headers)
        session = db_session.get(platform.PenaltyWorkoffSession, first['penalty']['session']['id'])
        session.started_at -= timedelta(hours=3)
        session.ends_at -= timedelta(hours=3)
        db_session.commit()
        response = client.post(f'{ROOT}/penalties/{penalty.id}/finish', headers=headers, json={'session_id': session.id})
        assert response.status_code == 200
        payload = response.get_json()
        assert payload['penalty']['total_hours'] == 4
        assert payload['penalty']['workoff_status'] == ('pending' if round_index == 0 else 'awaiting_unlock')
    assert platform.PenaltyWorkoffSession.query.filter_by(status='completed').count() == 2


def test_exhausted_catalog_has_clear_state_without_extra_penalty(client, workoff):
    _, _, penalty, headers = workoff
    payload = client.get(ROOT, headers=headers).get_json()
    response = client.post(f'{ROOT}/penalties/{penalty.id}/spin', headers=headers,
                           json={'exclude_keys': [item['id'] for item in payload['catalog']]})
    assert response.status_code == 409
    assert response.get_json()['code'] == 'no_tasks_available'
    assert platform.StudentPenalty.query.count() == 1


def test_revoked_membership_denies_open_session(client, workoff, db_session):
    user, pool, penalty, headers = workoff
    start(client, penalty, headers)
    platform.PoolVolunteer.query.filter_by(user_id=user.id, pool_id=pool.id).delete()
    db_session.commit()
    assert client.get(f'{ROOT}/penalties/{penalty.id}', headers=headers).status_code == 403


def test_legacy_status_control_cancels_session(client, workoff):
    _, _, penalty, headers = workoff
    first, _ = start(client, penalty, headers)
    changed = client.patch(f'/api/penalties/{penalty.id}', headers=headers, json={'workoff_status': 'not_worked_off'})
    assert changed.status_code == 200
    session = platform.db.session.get(platform.PenaltyWorkoffSession, first['penalty']['session']['id'])
    assert session.status == 'cancelled'


def test_staff_deleting_penalty_also_deletes_workoff_history(client, workoff, factories, auth_headers):
    _, _, penalty, headers = workoff
    start(client, penalty, headers)
    admin = factories.user('admin', role='admin')
    response = client.delete(f'/api/penalties/{penalty.id}', headers=auth_headers(admin))
    assert response.status_code == 200
    assert platform.PenaltyWorkoffSession.query.count() == 0
    assert platform.PenaltyWorkoffTask.query.count() == 0


def test_legacy_start_is_adopted_without_resetting_timer(client, workoff, db_session):
    _, _, penalty, headers = workoff
    original = platform._utcnow() - timedelta(minutes=30)
    penalty.workoff_status, penalty.date_worked_off = 'in_workoff', original
    db_session.commit()
    first, _ = start(client, penalty, headers)
    session = db_session.get(platform.PenaltyWorkoffSession, first['penalty']['session']['id'])
    assert session.started_at == original
    assert session.ends_at == original + timedelta(hours=2)
    db_session.refresh(penalty)
    assert penalty.date_worked_off == original


def test_expired_draft_and_forged_task_are_rejected(client, workoff):
    _, _, penalty, headers = workoff
    response = client.post(f'{ROOT}/penalties/{penalty.id}/commit', headers=headers,
                           json={'draft_token': 'forged', 'task_key': 'invented'})
    assert response.status_code == 409
    assert platform.PenaltyWorkoffSession.query.count() == 0


def test_completed_penalty_cannot_be_reopened_with_preview(client, workoff, db_session):
    _, _, penalty, headers = workoff
    draft = client.post(f'{ROOT}/penalties/{penalty.id}/spin', headers=headers, json={}).get_json()['draft_token']
    penalty.workoff_status = 'unlocked'
    db_session.commit()
    response = client.post(f'{ROOT}/penalties/{penalty.id}/commit', headers=headers, json={'draft_token': draft})
    assert response.status_code == 409
    assert platform.PenaltyWorkoffSession.query.count() == 0


def test_changed_active_pool_invalidates_old_preview(client, workoff, factories, db_session):
    _, pool, penalty, headers = workoff
    draft = client.post(f'{ROOT}/penalties/{penalty.id}/spin', headers=headers, json={}).get_json()['draft_token']
    pool.active = False
    db_session.commit()
    factories.pool('New active pool', active=True)
    response = client.post(f'{ROOT}/penalties/{penalty.id}/commit', headers=headers, json={'draft_token': draft})
    assert response.status_code in (403, 409)
    assert platform.PenaltyWorkoffSession.query.count() == 0


def test_bot_menu_opens_inline_webapp_without_sending_real_messages(client, workoff, db_session, monkeypatch):
    user, _, _, _ = workoff
    db_session.add(platform.TelegramAccount(user_id=user.id, telegram_username='test_user',
                                           telegram_user_id='712345', is_linked=True))
    db_session.commit()
    monkeypatch.setattr(platform, 'frontend_urls', ['https://platform.example.test'])
    sent = []
    monkeypatch.setattr(platform, 'telegram_send_message', lambda chat_id, text, **kwargs: sent.append(kwargs))
    result = platform.telegram_handle_message({'chat': {'id': 712345, 'type': 'private'},
                                                'from': {'id': 712345}, 'text': 'Выдача пенальти'})
    assert result['action'] == 'penalty_miniapp'
    assert sent[0]['reply_markup']['inline_keyboard'][0][0]['web_app']['url'] == 'https://platform.example.test/miniapp/penalties'
    assert [{'text': 'Выдача пенальти'}] in platform._telegram_main_keyboard(user)['keyboard']


def test_schema_upgrade_is_additive_and_idempotent(workoff, db_session):
    from migrate_penalty_miniapp import migrate
    _, _, penalty, _ = workoff
    penalty_id = penalty.id
    migrate()
    migrate()
    assert db_session.get(platform.StudentPenalty, penalty_id).hours == 2


def test_working_menu_lists_all_current_pool_sessions_and_restores_them(client, workoff, db_session):
    _, _, penalty, headers = workoff
    assert client.get(f'{ROOT}/working', headers=headers).get_json()['workers'] == []
    first, _ = start(client, penalty, headers)
    listed = client.get(f'{ROOT}/working', headers=headers)
    assert listed.status_code == 200
    worker = listed.get_json()['workers'][0]
    assert worker['student_name'] == penalty.student_name
    assert worker['session']['ends_at'] == first['penalty']['session']['ends_at']
    assert worker['session']['current_task']['id'] == first['penalty']['session']['current_task']['id']
    assert client.get(f'{ROOT}/working').status_code == 401


def test_working_menu_does_not_expose_other_pools(client, workoff, factories, db_session):
    _, _, _, headers = workoff
    old = factories.pool('Old isolated pool')
    db_session.add(platform.StudentPenalty(student_name='old_private_peer', pool_id=old.id, workoff_status='in_workoff'))
    db_session.commit()
    assert client.get(f'{ROOT}/working', headers=headers).get_json()['workers'] == []


def test_bot_callback_releases_database_locks_before_telegram_calls(workoff, db_session, monkeypatch):
    user, pool, penalty, _ = workoff
    db_session.add(platform.TelegramAccount(user_id=user.id, telegram_username='synthetic_volunteer', telegram_user_id='712345', is_linked=True))
    event = platform.NotificationEvent(type='penalty_method_question', status='sent',
        recipient_user_id=user.id, pool_id=pool.id, source_entity='penalty', source_entity_id=penalty.id)
    db_session.add(event)
    db_session.flush()
    db_session.add(platform.NotificationDelivery(notification_id=event.id, user_id=user.id,
        telegram_chat_id='712345', message_id='synthetic-message', delivery_status='sent'))
    db_session.commit()
    called = []

    def network_call(*args, **kwargs):
        assert not db_session().in_transaction(), 'Telegram must not hold database locks'
        called.append(args)
        return {}

    monkeypatch.setattr(platform, 'telegram_delete_message', network_call)
    monkeypatch.setattr(platform, 'telegram_answer_callback', network_call)
    monkeypatch.setattr(platform, 'queue_notification_dispatch', lambda *args: None)
    callback = {'id': 'synthetic-callback', 'from': {'id': 712345}, 'data': f'p:{penalty.id}:m:y:{event.id}'}
    assert platform.telegram_handle_callback(callback)['ok'] is True
    assert len(called) == 2
    db_session.refresh(penalty)
    assert penalty.workoff_status == 'in_workoff'
