from datetime import date, timedelta

import app as app_module


def _blocks_by_day(db_session, pool):
    blocks = app_module.ShiftBlock.query.filter_by(pool_id=pool.id).all()
    result = {}
    for block in blocks:
        index = (block.date - pool.start_date).days
        result.setdefault(index, []).append((block.time_start, block.time_end, block.label, block.capacity))
    return {index: sorted(rows) for index, rows in result.items()}


def test_python_schedule_changes_only_thursdays_and_fridays(client, factories, auth_headers, db_session):
    admin = factories.user('admin', role='admin')
    pool = factories.pool('Python', active=True, start_date=date(2026, 10, 5))

    response = client.post(
        f'/api/pools/{pool.id}/generate-schedule',
        json={'template': 'python'},
        headers=auth_headers(admin),
    )

    assert response.status_code == 200
    actual = _blocks_by_day(db_session, pool)
    assert len(actual) == 14
    assert actual[3] == sorted(app_module._SCHEDULE_TPL[2])
    assert actual[4] == sorted([('13:00', '15:00', 'EXAM', 5), ('16:00', '19:00', '', 2)])
    assert actual[10] == sorted(app_module._SCHEDULE_TPL[9])
    assert actual[11] == sorted([('13:00', '15:00', 'EXAM', 4), ('16:00', '19:00', '', 2)])
    for index in set(range(14)) - {3, 4, 10, 11}:
        assert actual[index] == sorted(app_module._SCHEDULE_TPL[index])


def test_standard_schedule_remains_default(client, factories, auth_headers, db_session):
    admin = factories.user('admin', role='admin')
    pool = factories.pool('Standard', active=True, start_date=date(2026, 10, 5))

    response = client.post(f'/api/pools/{pool.id}/generate-schedule', json={}, headers=auth_headers(admin))

    assert response.status_code == 200
    actual = _blocks_by_day(db_session, pool)
    assert actual == {index: sorted(rows) for index, rows in app_module._SCHEDULE_TPL.items()}


def test_python_regeneration_replaces_only_unused_generated_blocks(client, factories, auth_headers, db_session):
    admin = factories.user('admin', role='admin')
    pool = factories.pool('Python', active=True, start_date=date(2026, 10, 5))
    url = f'/api/pools/{pool.id}/generate-schedule'
    headers = auth_headers(admin)
    assert client.post(url, json={}, headers=headers).status_code == 200
    before = _blocks_by_day(db_session, pool)

    response = client.post(url, json={'template': 'python'}, headers=headers)

    assert response.status_code == 200
    assert response.get_json()['replaced'] == 6
    after = _blocks_by_day(db_session, pool)
    assert after[4] == sorted(app_module._PYTHON_SCHEDULE_TPL[4])
    assert after[11] == sorted(app_module._PYTHON_SCHEDULE_TPL[11])
    for index in set(range(14)) - {3, 4, 10, 11}:
        assert after[index] == before[index]
    assert client.post(url, json={'template': 'python'}, headers=headers).get_json()['replaced'] == 0


def test_python_regeneration_refuses_to_delete_signed_up_block(client, factories, auth_headers, db_session):
    admin = factories.user('admin', role='admin')
    volunteer = factories.user('volunteer')
    pool = factories.pool('Python', active=True, start_date=date(2026, 10, 5))
    url = f'/api/pools/{pool.id}/generate-schedule'
    headers = auth_headers(admin)
    assert client.post(url, json={}, headers=headers).status_code == 200
    exam_block = app_module.ShiftBlock.query.filter_by(pool_id=pool.id, date=pool.start_date + timedelta(days=3)).first()
    db_session.add(app_module.Signup(block_id=exam_block.id, user_id=volunteer.id))
    db_session.commit()
    before = _blocks_by_day(db_session, pool)

    response = client.post(url, json={'template': 'python'}, headers=headers)

    assert response.status_code == 409
    assert _blocks_by_day(db_session, pool) == before
    assert app_module.Signup.query.filter_by(block_id=exam_block.id).count() == 1


def test_python_regeneration_relabels_afternoon_without_losing_signups(client, factories, auth_headers, db_session):
    admin = factories.user('admin', role='admin')
    volunteer = factories.user('volunteer')
    pool = factories.pool('Python', active=True, start_date=date(2026, 10, 5))
    url = f'/api/pools/{pool.id}/generate-schedule'
    headers = auth_headers(admin)
    assert client.post(url, json={'template': 'python'}, headers=headers).status_code == 200
    afternoon = app_module.ShiftBlock.query.filter_by(
        pool_id=pool.id, date=pool.start_date + timedelta(days=4), time_start='16:00',
    ).one()
    afternoon.label = 'EXAM'  # блок из ранее опубликованного шаблона
    db_session.add(app_module.Signup(block_id=afternoon.id, user_id=volunteer.id))
    db_session.commit()

    response = client.post(url, json={'template': 'python'}, headers=headers)

    assert response.status_code == 200
    assert response.get_json()['created'] == 0
    assert response.get_json()['replaced'] == 0
    assert db_session.get(app_module.ShiftBlock, afternoon.id).label == ''
    assert app_module.Signup.query.filter_by(block_id=afternoon.id, user_id=volunteer.id).count() == 1
