import json
from datetime import date, datetime, time, timedelta

import app as app_module


def _payload_text(event):
    return json.loads(event.payload or '{}').get('text', '')


def test_daily_shift_notifications_at_14_include_coworkers_and_exam_brief(factories, db_session, monkeypatch):
    admin = factories.user('admin', role='admin', password='secret123', telegram='@admin_tg', name='Админ')
    team_lead = factories.user('lead', role='team_lead', password='lead1234', telegram='@lead_tg', name='Лид')
    unrelated_admin = factories.user('other_admin', role='admin', password='secret123', telegram='@other_admin_tg', name='Чужой админ')
    unrelated_lead = factories.user('other_lead', role='team_lead', password='lead1234', telegram='@other_lead_tg', name='Чужой лид')
    volunteer = factories.user('odessabu', role='volunteer', telegram='@DenisSadykov', name='Денис')
    coworker = factories.user('masha', role='volunteer', telegram='@masha_tg', name='Маша')
    pool = factories.pool('Active pool', active=True)

    target_date = date(2026, 7, 5)
    now_msk = datetime.combine(target_date - timedelta(days=1), time(14, 0))
    monkeypatch.setattr(app_module, '_moscow_now', lambda: now_msk)
    monkeypatch.setattr(app_module, 'EXAM_BRIEF_URL', 'https://example.com/exam-brief')

    exam_block = app_module.ShiftBlock(
        pool_id=pool.id,
        date=target_date,
        time_start='11:00',
        time_end='17:00',
        label='EXAM',
    )
    db_session.add(exam_block)
    db_session.commit()

    factories.assign(volunteer, pool)
    factories.assign(coworker, pool)
    factories.assign(admin, pool, pool_role='responsible_admin')
    factories.assign(team_lead, pool, pool_role='responsible_team_lead')
    db_session.add_all([
        app_module.Signup(block_id=exam_block.id, user_id=volunteer.id),
        app_module.Signup(block_id=exam_block.id, user_id=coworker.id),
    ])
    db_session.commit()

    app_module._schedule_daily_shift_notifications()
    db_session.commit()

    volunteer_events = db_session.query(app_module.NotificationEvent).filter_by(
        type='shift_reminder_volunteer',
        recipient_user_id=volunteer.id,
        pool_id=pool.id,
    ).all()
    assert len(volunteer_events) == 1
    volunteer_text = _payload_text(volunteer_events[0])
    assert 'Завтра ты дежуришь на бассейне' in volunteer_text
    assert '11:00-17:00' in volunteer_text
    assert '@masha_tg' in volunteer_text
    assert 'https://example.com/exam-brief' in volunteer_text

    staff_events = db_session.query(app_module.NotificationEvent).filter_by(
        type='shift_reminder_staff',
        pool_id=pool.id,
    ).order_by(app_module.NotificationEvent.recipient_user_id).all()
    assert len(staff_events) == 2
    recipients = {event.recipient_user_id for event in staff_events}
    assert admin.id in recipients
    assert team_lead.id in recipients
    assert unrelated_admin.id not in recipients
    assert unrelated_lead.id not in recipients
    summary_text = _payload_text(staff_events[0])
    assert 'Кто дежурит завтра' in summary_text
    assert 'Денис (@DenisSadykov)' in summary_text
    assert 'Маша (@masha_tg)' in summary_text


def test_daily_shift_notifications_do_not_run_before_14(factories, db_session, monkeypatch):
    volunteer = factories.user('odessabu', role='volunteer', telegram='@DenisSadykov')
    pool = factories.pool('Active pool', active=True)
    factories.assign(volunteer, pool)

    target_date = date(2026, 7, 5)
    now_msk = datetime.combine(target_date - timedelta(days=1), time(13, 0))
    monkeypatch.setattr(app_module, '_moscow_now', lambda: now_msk)

    block = app_module.ShiftBlock(
        pool_id=pool.id,
        date=target_date,
        time_start='10:00',
        time_end='14:00',
    )
    db_session.add(block)
    db_session.commit()
    db_session.add(app_module.Signup(block_id=block.id, user_id=volunteer.id))
    db_session.commit()

    app_module._schedule_daily_shift_notifications()
    db_session.commit()

    assert db_session.query(app_module.NotificationEvent).count() == 0


def test_signup_after_14_queues_shift_change_notifications(client, factories, auth_headers, db_session, monkeypatch):
    admin = factories.user('admin', role='admin', password='secret123', telegram='@admin_tg', name='Админ')
    team_lead = factories.user('lead', role='team_lead', password='lead1234', telegram='@lead_tg', name='Лид')
    unrelated_admin = factories.user('other_admin', role='admin', password='secret123', telegram='@other_admin_tg', name='Чужой админ')
    unrelated_lead = factories.user('other_lead', role='team_lead', password='lead1234', telegram='@other_lead_tg', name='Чужой лид')
    volunteer = factories.user('odessabu', role='volunteer', telegram='@DenisSadykov', name='Денис')
    coworker = factories.user('masha', role='volunteer', telegram='@masha_tg', name='Маша')
    pool = factories.pool('Active pool', active=True)

    tomorrow = date(2026, 7, 5)
    now_msk = datetime.combine(tomorrow - timedelta(days=1), time(15, 0))
    fixed_now_utc = now_msk - app_module.MOSCOW_OFFSET
    monkeypatch.setattr(app_module, '_moscow_now', lambda: now_msk)
    monkeypatch.setattr(app_module, '_utcnow', lambda: fixed_now_utc)
    monkeypatch.setattr(app_module, 'EXAM_BRIEF_URL', 'https://example.com/exam-brief')

    factories.assign(volunteer, pool)
    factories.assign(coworker, pool)
    factories.assign(admin, pool, pool_role='responsible_admin')
    factories.assign(team_lead, pool, pool_role='responsible_team_lead')
    block = app_module.ShiftBlock(
        pool_id=pool.id,
        date=tomorrow,
        time_start='11:00',
        time_end='17:00',
        label='EXAM',
    )
    db_session.add(block)
    db_session.commit()
    db_session.add(app_module.Signup(block_id=block.id, user_id=coworker.id))
    db_session.commit()

    response = client.post(f'/api/blocks/{block.id}/signup', headers=auth_headers(volunteer))

    assert response.status_code == 201

    volunteer_events = db_session.query(app_module.NotificationEvent).filter_by(
        type='shift_change_volunteer',
        recipient_user_id=volunteer.id,
        pool_id=pool.id,
    ).all()
    assert len(volunteer_events) == 1
    volunteer_event = volunteer_events[0]
    volunteer_text = _payload_text(volunteer_event)
    assert 'Ты дежуришь завтра' in volunteer_text
    assert '@masha_tg' in volunteer_text
    assert 'https://example.com/exam-brief' in volunteer_text
    assert volunteer_event.scheduled_for == fixed_now_utc + timedelta(minutes=5)

    staff_events = db_session.query(app_module.NotificationEvent).filter_by(
        type='shift_change_staff',
        pool_id=pool.id,
    ).order_by(app_module.NotificationEvent.recipient_user_id).all()
    assert len(staff_events) == 2
    recipients = {event.recipient_user_id for event in staff_events}
    assert admin.id in recipients
    assert team_lead.id in recipients
    assert unrelated_admin.id not in recipients
    assert unrelated_lead.id not in recipients
    assert all(event.scheduled_for == fixed_now_utc + timedelta(minutes=5) for event in staff_events)
    assert any('@DenisSadykov' in _payload_text(event) for event in staff_events)
