from datetime import date, datetime, timedelta

import app as app_module
import pytest
from sqlalchemy import event


def freeze(monkeypatch):
    now = datetime(2026, 10, 11, 12, 0)
    monkeypatch.setattr(app_module, '_moscow_now', lambda: now)
    monkeypatch.setattr(app_module, '_moscow_today', lambda: now.date())
    return now


def signup(db_session, factories, user, pool, day, start='10:00', end='14:00', label=''):
    block = factories.shift_block(pool, day, start, end, label)
    db_session.add(app_module.Signup(user_id=user.id, block_id=block.id))
    db_session.commit()
    return block


def test_statistics_private_and_password_gated(client, factories, auth_headers):
    user = factories.user('initial', password=None)
    assert client.get('/api/me/statistics').status_code == 401
    response = client.get('/api/me/statistics', headers=auth_headers(user))
    assert response.status_code == 403
    assert response.json['code'] == 'password_change_required'


def test_statistics_history_future_boundary_and_reward_parity(client, factories, db_session, auth_headers, monkeypatch):
    now = freeze(monkeypatch)
    user = factories.user('self')
    other = factories.user('other')
    old = factories.pool('Old', archived=True, start_date=date(2026, 9, 1))
    current = factories.pool('Python', active=True, start_date=date(2026, 10, 12))
    empty = factories.pool('Invitation', start_date=date(2027, 1, 1))
    foreign = factories.pool('Private other pool')
    old_pv = factories.assign(user, old)
    current_pv = factories.assign(user, current)
    factories.assign(user, empty)
    factories.assign(other, foreign)
    old_pv.has_confession = True
    old_pv.coins_adjustment = -10
    signup(db_session, factories, user, old, date(2026, 9, 5), label='EXAM')
    signup(db_session, factories, user, current, now.date(), start='10:00', end='12:00')
    signup(db_session, factories, user, current, now.date(), start='11:00', end='13:00')
    signup(db_session, factories, user, current, now.date() + timedelta(days=1))
    signup(db_session, factories, other, foreign, date(2026, 9, 5))
    db_session.add_all([
        app_module.GroupReview(pool_id=old.id, reviewer_id=user.id, review_date=date(2026, 9, 5), time_start='11:00', flow='1', quantity=5),
        app_module.GroupReview(pool_id=current.id, reviewer_id=user.id, review_date=date(2026, 12, 5), time_start='11:00', flow='1', quantity=7),
        app_module.RewardEvent(user_id=user.id, pool_id=old.id, event_type='manual_bonus', coins=23, quantity=1),
        app_module.RewardEvent(user_id=user.id, pool_id=None, event_type='manual_bonus', coins=99),
        app_module.RewardEvent(user_id=other.id, pool_id=foreign.id, event_type='manual_bonus', coins=999),
    ])
    db_session.commit()
    response = client.get(f'/api/me/statistics?user_id={other.id}&pool_id={foreign.id}', headers=auth_headers(user))
    assert response.status_code == 200
    assert response.headers['Cache-Control'] == 'no-store'
    data = response.json
    assert {row['id'] for row in data['pools']} == {old.id, current.id, empty.id}
    summary = data['summary']
    assert summary['pools'] == 3
    assert summary['active_pools'] == 2
    assert summary['past_shifts'] == 2
    assert summary['upcoming_shifts'] == 2
    assert summary['past_hours'] == 6
    assert summary['upcoming_hours'] == 6
    assert summary['exam_shifts'] == 1
    assert summary['group_reviews'] == 5
    assert len(data['monthly_activity']) == 12
    assert data['monthly_activity'][-1] == {'month': '2026-10', 'hours': 2, 'shifts': 1}
    assert data['unscoped_rewards'] == {'count': 1, 'coins': 99}
    assert data['upcoming_shifts'][0]['in_progress'] is True
    current_history = next(row for row in data['pools'] if row['id'] == current.id)['shift_history']
    assert {row['state'] for row in current_history} == {'past', 'in_progress', 'upcoming'}
    for pool, pv in [(old, old_pv), (current, current_pv)]:
        expected = app_module.calculate_pool_rewards(user, pool.id, pv.has_confession,
                                                    pv.coins_adjustment, pv.pool_role)
        actual = next(row for row in data['pools'] if row['id'] == pool.id)
        assert actual['coins'] == expected['total']
    assert data['achievements'] == []


def test_assistant_only_marked_past_meetings_and_manual_coins(client, factories, db_session, auth_headers, monkeypatch):
    now = freeze(monkeypatch)
    user = factories.user('assistant')
    pool = factories.pool('Historic', archived=True)
    pv = factories.assign(user, pool, pool_role='tribe_assistant', tribe='Олени')
    for tribe, offset, attending in [('Олени', -1, True), ('Олени', -2, True), ('Олени', -3, True),
                                     ('Олени', -4, False), ('Олени', 0, True), ('Олени', 1, True),
                                     ('Ленты', -1, True)]:
        db_session.add(app_module.TribeEvent(pool_id=pool.id, tribe=tribe, title='Meeting',
                                            event_date=now.date() + timedelta(days=offset), assistant_attending=attending))
    db_session.commit()
    data = client.get('/api/me/statistics', headers=auth_headers(user)).json
    assert data['summary']['assistant_meetings'] == 3
    assert data['summary']['coins'] == 3 * app_module.REWARD_RATES['tribe_master_event']
    assert data['achievements'] == []
    # An override changes coins, never fabricates meeting history / achievements.
    pv.tribe_event_count_override = 12
    db_session.commit()
    data = client.get('/api/me/statistics', headers=auth_headers(user)).json
    assert data['summary']['coins'] == 12 * app_module.REWARD_RATES['tribe_master_event']
    assert data['summary']['tribe_meetings'] == 3
    assert data['warnings']
    # Undoing attendance removes automatic achievement progress too.
    app_module.TribeEvent.query.filter_by(pool_id=pool.id).update({'assistant_attending': False})
    db_session.commit()
    data = client.get('/api/me/statistics', headers=auth_headers(user)).json
    assert data['summary']['assistant_meetings'] == 0
    assert data['achievements'] == []


def test_master_future_coins_not_future_achievements(client, factories, db_session, auth_headers, monkeypatch):
    now = freeze(monkeypatch)
    user = factories.user('master')
    pool = factories.pool()
    pv = factories.assign(user, pool, pool_role='tribe_master', tribe='Ленты')
    for offset in [-1, 0, 1]:
        db_session.add(app_module.TribeEvent(pool_id=pool.id, tribe='Ленты', title='Meeting',
                                            event_date=now.date() + timedelta(days=offset)))
    db_session.commit()
    data = client.get('/api/me/statistics', headers=auth_headers(user)).json
    assert data['summary']['tribe_meetings'] == 1
    expected = app_module.calculate_pool_rewards(user, pool.id, False, 0, pv.pool_role, pv.tribe)
    assert data['summary']['coins'] == expected['total']


def test_empty_statistics_and_invalid_legacy_time(client, factories, db_session, auth_headers, monkeypatch):
    freeze(monkeypatch)
    user = factories.user('empty')
    data = client.get('/api/me/statistics', headers=auth_headers(user)).json
    assert data['summary']['pools'] == 0
    assert data['pools'] == []
    assert len(data['monthly_activity']) == 12
    assert data['achievements'] == []
    pool = factories.pool()
    signup(db_session, factories, user, pool, date(2026, 9, 1), start='broken')
    data = client.get('/api/me/statistics', headers=auth_headers(user)).json
    assert data['summary']['shifts'] == 1
    assert data['summary']['past_hours'] == 0
    assert data['warnings']


def test_query_count_does_not_grow_per_pool(client, factories, db_session, auth_headers, monkeypatch):
    freeze(monkeypatch)
    user = factories.user('many_pools')
    for index in range(15):
        pool = factories.pool(f'Pool {index}')
        factories.assign(user, pool)
        signup(db_session, factories, user, pool, date(2026, 9, 1))
    headers = auth_headers(user)
    statements = []
    engine = app_module.db.engine

    def capture(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith('SELECT'):
            statements.append(statement)

    event.listen(engine, 'before_cursor_execute', capture)
    try:
        response = client.get('/api/me/statistics', headers=headers)
    finally:
        event.remove(engine, 'before_cursor_execute', capture)
    assert response.status_code == 200
    assert response.json['summary']['pools'] == 15
    assert len(statements) <= 10


@pytest.mark.parametrize('role', ['volunteer', 'tribe_master', 'tribe_assistant', 'team_lead', 'admin'])
def test_achievements_paused_for_every_role(client, factories, auth_headers, role):
    user = factories.user('person', role=role)
    response = client.get('/api/me/statistics', headers=auth_headers(user))
    assert response.status_code == 200
    assert response.json['achievements'] == []
