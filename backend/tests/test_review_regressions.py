from datetime import date

import pytest
import app as platform


def linked_account(db_session, user, tg_id='777', **overrides):
    values = dict(user_id=user.id, telegram_username='old_handle',
                  telegram_user_id=tg_id, telegram_chat_id=tg_id,
                  is_linked=True, delivery_enabled=True)
    values.update(overrides)
    account = platform.TelegramAccount(**values)
    db_session.add(account)
    db_session.commit()
    return account


def test_recycled_telegram_username_cannot_rebind_existing_owner(factories, db_session, monkeypatch):
    owner = factories.user('owner', telegram='@old_handle')
    account = linked_account(db_session, owner)
    monkeypatch.setattr(platform, 'telegram_send_message', lambda *a, **k: {})
    monkeypatch.setattr(platform, 'sync_telegram_photo', lambda *a: None)

    result = platform.telegram_link_account(888, {'id': 888, 'username': 'old_handle'})

    assert result['reason'] == 'identity_conflict'
    db_session.refresh(account)
    assert account.telegram_user_id == '777'
    assert account.telegram_chat_id == '777'
    assert platform._telegram_user_from_tg({'id': 888, 'username': 'old_handle'}) is None
    # The real owner still works after changing or removing their username.
    assert platform._telegram_user_from_tg({'id': 777, 'username': 'new_handle'}).id == owner.id
    assert platform._telegram_user_from_tg({'id': 777}).id == owner.id
    result = platform.telegram_link_account(777, {'id': 777, 'username': 'new_handle'})
    assert result['linked'] is True


def test_legacy_telegram_link_upgrades_only_by_private_chat_identity(factories, db_session, monkeypatch):
    owner = factories.user('legacy_owner', telegram='@old_handle')
    account = linked_account(db_session, owner, telegram_user_id=None)

    assert platform._telegram_user_from_tg({'id': 888, 'username': 'old_handle'}) is None
    assert account.telegram_user_id is None
    assert platform._telegram_user_from_tg({'id': 777, 'username': 'changed_handle'}).id == owner.id
    assert account.telegram_user_id is None
    monkeypatch.setattr(platform, 'sync_telegram_photo', lambda *a: None)
    platform.upsert_telegram_account(owner, {'id': 777, 'username': 'changed_handle'}, 777)
    assert account.telegram_user_id == '777'


def test_telegram_start_cannot_bind_group_chat(factories, db_session):
    owner = factories.user('group_owner', telegram='@old_handle')
    result = platform.telegram_link_account(-123, {'id': 777, 'username': 'old_handle'})
    assert result['reason'] == 'private_chat_required'
    assert platform.TelegramAccount.query.filter_by(user_id=owner.id).count() == 0


@pytest.mark.parametrize('restriction', ['inactive', 'removed', 'cancelled', 'recycled_username'])
def test_old_bot_callback_cannot_change_penalty_after_access_revoked(
    factories, db_session, monkeypatch, restriction,
):
    user = factories.user('actor', telegram='@old_handle')
    pool = factories.pool(active=True)
    if restriction != 'removed':
        factories.assign(user, pool)
    if restriction == 'inactive':
        user.active = False
    linked_account(db_session, user)
    penalty = platform.StudentPenalty(student_name='synthetic_student',
                                       volunteer_id=user.id, pool_id=pool.id, workoff_status='pending')
    db_session.add(penalty)
    db_session.flush()
    event = platform.NotificationEvent(type='penalty_method_question',
        status='cancelled' if restriction == 'cancelled' else 'sent', recipient_user_id=user.id,
        pool_id=pool.id, source_entity='penalty', source_entity_id=penalty.id)
    db_session.add(event)
    db_session.commit()
    monkeypatch.setattr(platform, 'telegram_answer_callback', lambda *a, **k: {})
    monkeypatch.setattr(platform, 'telegram_delete_message', lambda *a, **k: pytest.fail('Invalid action deleted a message'))

    result = platform.telegram_handle_callback({
        'id': 'synthetic_callback', 'from': {'id': 888 if restriction == 'recycled_username' else 777,
                                           'username': 'old_handle'},
        'data': f'p:{penalty.id}:m:y:{event.id}',
    })

    assert result['ok'] is False
    db_session.refresh(penalty)
    assert penalty.workoff_status == 'pending'
    assert platform.PenaltyHistory.query.count() == 0


@pytest.mark.parametrize('legacy_invite_schema', [False, True])
def test_delete_creator_preserves_other_users_rewards_reviews_invites_and_penalties(
    client, factories, db_session, auth_headers, legacy_invite_schema,
):
    admin = factories.user('admin', role='admin')
    creator = factories.user('creator', role='team_lead')
    recipient = factories.user('recipient')
    pool = factories.pool(active=True)
    factories.assign(recipient, pool)
    if legacy_invite_schema:
        conn = db_session.connection()
        old_schema = str(platform.CreateTable(platform.PoolInviteLink.__table__).compile(dialect=conn.dialect))
        old_schema = old_schema.replace('created_by INTEGER,', 'created_by INTEGER NOT NULL,')
        assert 'created_by INTEGER NOT NULL' in old_schema
        conn.exec_driver_sql('DROP TABLE pool_invite_links')
        conn.exec_driver_sql(old_schema)
    reward = platform.RewardEvent(user_id=recipient.id, pool_id=pool.id,
        created_by=creator.id, event_type='manual', coins=40)
    review = platform.GroupReview(reviewer_id=recipient.id, created_by=creator.id,
        pool_id=pool.id, review_date=date.today(), time_start='12:00', flow='A', quantity=2)
    invite = platform.PoolInviteLink(pool_id=pool.id, created_by=creator.id, token='preserve-invite')
    penalty = platform.StudentPenalty(student_name='synthetic', pool_id=pool.id,
        database_entry_marked=True, database_entry_marked_by=creator.id)
    db_session.add_all([reward, review, invite, penalty])
    db_session.commit()
    ids = (reward.id, review.id, invite.id, penalty.id, creator.id)
    if legacy_invite_schema:
        platform._upgrade_sqlite_invite_creator(db_session.connection())
        db_session.commit()
        db_session.expire_all()
        assert db_session.get(platform.PoolInviteLink, ids[2]).token == 'preserve-invite'
    # SQLite normally hides this production FK failure. Explicitly enforce it.
    db_session.execute(platform.db.text('PRAGMA foreign_keys=ON'))
    assert db_session.execute(platform.db.text('PRAGMA foreign_keys')).scalar() == 1
    try:
        response = client.delete(f'/api/users/{creator.id}', headers=auth_headers(admin))
        assert response.status_code == 200
        db_session.expire_all()
        assert db_session.get(platform.User, ids[4]) is None
        reward = db_session.get(platform.RewardEvent, ids[0])
        review = db_session.get(platform.GroupReview, ids[1])
        invite = db_session.get(platform.PoolInviteLink, ids[2])
        penalty = db_session.get(platform.StudentPenalty, ids[3])
        assert (reward.coins, reward.user_id, reward.created_by) == (40, recipient.id, None)
        assert (review.quantity, review.reviewer_id, review.created_by) == (2, recipient.id, None)
        assert invite.token == 'preserve-invite' and invite.is_active and invite.created_by is None
        assert penalty.database_entry_marked and penalty.database_entry_marked_by is None
    finally:
        db_session.rollback()
        db_session.execute(platform.db.text('PRAGMA foreign_keys=OFF'))


@pytest.mark.parametrize('restriction', ['removed', 'inactive', 'muted'])
def test_dispatch_rechecks_current_recipient_membership_and_preferences(
    factories, db_session, monkeypatch, restriction,
):
    user = factories.user('recipient', role='admin' if restriction == 'muted' else 'volunteer')
    pool = factories.pool(active=True)
    if restriction != 'removed':
        factories.assign(user, pool, pool_role='responsible_admin' if restriction == 'muted' else 'volunteer',
                         notifications_enabled=restriction != 'muted')
    if restriction == 'inactive':
        user.active = False
    linked_account(db_session, user)
    event = platform.NotificationEvent(type='broadcast', status='queued',
        recipient_user_id=user.id, pool_id=pool.id, payload='{"text":"synthetic"}')
    db_session.add(event)
    db_session.commit()
    monkeypatch.setattr(platform, 'telegram_send_message', lambda *a, **k: pytest.fail('Revoked recipient received a message'))

    result = platform.process_pending_notifications(event_ids=[event.id], schedule_events=False)

    db_session.refresh(event)
    assert result['sent'] == 0 and result['skipped'] == 1
    assert event.status == 'cancelled'


def test_remove_member_cancels_pending_events_but_keeps_delivery_history(
    client, factories, db_session, auth_headers,
):
    admin = factories.user('admin', role='admin')
    user = factories.user('recipient')
    pool = factories.pool(active=True)
    factories.assign(user, pool)
    events = [platform.NotificationEvent(type='broadcast', status=status,
              recipient_user_id=user.id, pool_id=pool.id) for status in ['queued', 'pending', 'processing', 'sent']]
    db_session.add_all(events)
    db_session.commit()

    response = client.delete(f'/api/pools/{pool.id}/volunteers/{user.id}', headers=auth_headers(admin))

    assert response.status_code == 200
    db_session.expire_all()
    assert [db_session.get(platform.NotificationEvent, e.id).status for e in events] == ['cancelled'] * 3 + ['sent']


def test_health_checks_actual_database_and_redacts_connection_failure(client, monkeypatch):
    def unavailable():
        raise RuntimeError('secret connection string must never appear')
    monkeypatch.setattr(platform.db.engine, 'begin', unavailable)
    response = client.get('/api/health')
    assert response.status_code == 503
    assert response.get_json()['status'] == 'degraded'
    assert response.get_json()['database']['ok'] is False
    assert b'secret connection' not in response.data


@pytest.mark.parametrize('question,status,event_type', [
    ('m', 'pending', 'penalty_method_question'), ('c', 'in_workoff', 'penalty_workoff_check'),
])
def test_existing_skip_buttons_remain_usable(factories, db_session, monkeypatch, question, status, event_type):
    user = factories.user('skip_actor')
    pool = factories.pool(active=True)
    factories.assign(user, pool)
    linked_account(db_session, user)
    penalty = platform.StudentPenalty(student_name='synthetic', pool_id=pool.id, workoff_status=status)
    db_session.add(penalty)
    db_session.flush()
    event = platform.NotificationEvent(type=event_type, status='sent', recipient_user_id=user.id,
        pool_id=pool.id, source_entity='penalty', source_entity_id=penalty.id)
    db_session.add(event)
    db_session.commit()
    skipped = []
    monkeypatch.setattr(platform, 'telegram_answer_callback', lambda *a, **k: {})
    monkeypatch.setattr(platform, '_delete_related_penalty_messages', lambda *a, **k: skipped.append(a))
    result = platform.telegram_handle_callback({'id': 'skip', 'from': {'id': 777},
                                                'data': f'p:{penalty.id}:{question}:s:{event.id}'})
    assert result['ok'] is True
    assert skipped == [(penalty.id, event_type, event.id)]
    db_session.refresh(penalty)
    assert penalty.workoff_status == status
