"""Scoped Telegram authentication and atomic two-hour penalty work-off sessions.

No Telegram network calls occur under a database lock. Catalog edits affect new
assignments only; assigned tasks retain snapshots of their original wording.
"""
import hashlib
import hmac
import json
import secrets
import time
from datetime import timedelta
from functools import wraps
from pathlib import Path
from urllib.parse import parse_qsl

from flask import g, jsonify, request
from itsdangerous import BadSignature, URLSafeTimedSerializer
from sqlalchemy.exc import IntegrityError


SESSION_SECONDS = 2 * 60 * 60
INIT_DATA_MAX_AGE = 5 * 60
TOKEN_MAX_AGE = 8 * 60 * 60
DRAFT_MAX_AGE = 15 * 60
OPEN_STATUSES = {'pending', 'overdue', 'in_workoff'}


def validate_telegram_init_data(raw, bot_token, now=None):
    """Validate Telegram's HMAC, timestamp and stable numeric identity."""
    if not bot_token or not isinstance(raw, str) or not 1 <= len(raw) <= 16384:
        raise ValueError('Открой мини-ап заново из бота Telegram')
    try:
        pairs = parse_qsl(raw, keep_blank_values=True, strict_parsing=True, max_num_fields=32)
        values = dict(pairs)
        if len(values) != len(pairs):
            raise ValueError('duplicate fields')
        supplied_hash = values.pop('hash')
        if len(supplied_hash) != 64:
            raise ValueError('hash length')
        secret = hmac.new(b'WebAppData', bot_token.encode(), hashlib.sha256).digest()
        check = '\n'.join(f'{key}={value}' for key, value in sorted(values.items()))
        expected_hash = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected_hash, supplied_hash):
            raise ValueError('signature')
        age = (time.time() if now is None else now) - int(values['auth_date'])
        if age < -30 or age > INIT_DATA_MAX_AGE:
            raise ValueError('expired')
        user = json.loads(values['user'])
        user_id = user.get('id') if isinstance(user, dict) else None
        if type(user_id) is not int or not 0 < user_id < 2 ** 53 or user.get('is_bot'):
            raise ValueError('identity')
        return user
    except (ValueError, TypeError, KeyError, OverflowError) as exc:
        raise ValueError('Не удалось проверить вход. Открой мини-ап заново из бота Telegram') from exc


class MiniAppProblem(Exception):
    def __init__(self, message, status=400, code='invalid_request'):
        super().__init__(message)
        self.message, self.status, self.code = message, status, code


def register_penalty_miniapp(app, db, context):
    User = context['User']
    Penalty = context['StudentPenalty']
    Session = context['PenaltyWorkoffSession']
    Task = context['PenaltyWorkoffTask']
    signing_key = app.config['SECRET_KEY']
    login_signer = URLSafeTimedSerializer(signing_key, salt='penalty-miniapp-login-v1')
    draft_signer = URLSafeTimedSerializer(signing_key, salt='penalty-miniapp-draft-v1')
    with Path(__file__).with_name('penalty_tasks.json').open(encoding='utf-8') as source:
        catalog = json.load(source)
    by_key = {item['id']: item for item in catalog}
    if len(by_key) != len(catalog) or not catalog:
        raise RuntimeError('Каталог заданий должен быть непустым, с уникальными id')
    for item in catalog:
        if not 0 < item['estimated_minutes'] <= 120 or not item['title'] or not item['description']:
            raise RuntimeError('Некорректное задание пенальти')

    @app.errorhandler(MiniAppProblem)
    def miniapp_problem(error):
        db.session.rollback()
        return jsonify({'error': error.message, 'code': error.code}), error.status

    def body():
        value = request.get_json(silent=True)
        if not isinstance(value, dict):
            raise MiniAppProblem('Нужен JSON-объект')
        return value

    def request_user():
        auth = request.headers.get('Authorization', '')
        if not auth.startswith('MiniApp '):
            return context['load_user_from_request']()
        try:
            payload = login_signer.loads(auth[8:], max_age=TOKEN_MAX_AGE)
            user = db.session.get(User, payload['id'])
            account = context['_telegram_account_from_tg']({'id': payload['telegram_id']})
            if (not user or not user.active or not account or account.user_id != user.id
                    or payload['credential_version'] != context['_credential_version'](user)):
                return None
            return user
        except (BadSignature, KeyError, TypeError, ValueError):
            return None

    def require_access(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = request_user()
            if not user:
                raise MiniAppProblem('Войди на платформу или открой мини-ап из привязанного Telegram', 401, 'unauthorized')
            if request.method != 'GET':
                # Membership removal and account deletion use this same user lock.
                user = User.query.filter_by(id=user.id).populate_existing().with_for_update().first()
                # Recheck credentials/link after waiting for the same lock used
                # by password changes, membership changes and account removal.
                if not user or not user.active or request_user() is None:
                    raise MiniAppProblem('Доступ закрыт', 403, 'access_revoked')
            blocked = context['_password_change_gate'](user)
            if blocked is not None:
                return blocked
            context['_bind_request_user'](user)
            pool_id, error = context['_active_pool_id_for_request']()
            if error:
                return error
            g.miniapp_pool_id = pool_id
            try:
                return fn(*args, **kwargs)
            except IntegrityError as error:
                db.session.rollback()
                raise MiniAppProblem('Данные уже изменились. Обнови отработку', 409, 'session_changed') from error
        return wrapper

    def get_penalty(penalty_id, lock=False):
        if lock:
            pool = context['Pool'].query.filter_by(id=g.miniapp_pool_id).populate_existing().with_for_update(read=True).first()
            if not pool or not pool.active or pool.archived:
                raise MiniAppProblem('Активный бассейн изменился. Открой мини-ап заново', 409, 'pool_changed')
            context['_acquire_dedupe_lock']('penalty-status', penalty_id)
        query = Penalty.query.filter_by(id=penalty_id, pool_id=g.miniapp_pool_id)
        if lock:
            query = query.populate_existing().with_for_update()
        penalty = query.first()
        if not penalty:
            raise MiniAppProblem('Пенальти не найдено в активном бассейне', 404, 'not_found')
        return penalty

    def current_session(penalty):
        if hasattr(g, 'miniapp_sessions'):
            return next((item for item in g.miniapp_sessions.get(penalty.id, []) if item.status == 'active'), None)
        return Session.query.filter_by(penalty_id=penalty.id, status='active').first()

    def current_task(session):
        return Task.query.filter_by(session_id=session.id, status='active').first() if session else None

    def iso(value):
        return value.isoformat(timespec='milliseconds') + 'Z' if value else None

    def task_payload(task):
        return {
            'id': task.id, 'task_key': task.task_key, 'title': task.title,
            'description': task.description, 'estimated_minutes': task.estimated_minutes,
            'icon': by_key.get(task.task_key, {}).get('icon', 'box'),
            'status': task.status, 'assigned_at': iso(task.assigned_at),
            'finished_at': iso(task.finished_at), 'assigned_by_nick': task.assigned_by_nick,
        }

    def session_payload(session):
        if not session:
            return None
        history = (g.miniapp_tasks.get(session.id, []) if hasattr(g, 'miniapp_tasks')
                   else Task.query.filter_by(session_id=session.id).order_by(Task.id).all())
        return {
            'id': session.id, 'status': session.status,
            'started_at': iso(session.started_at), 'ends_at': iso(session.ends_at),
            'finished_at': iso(session.finished_at), 'duration_seconds': SESSION_SECONDS,
            'tasks': [task_payload(item) for item in history],
            'current_task': next((task_payload(item) for item in history if item.status == 'active'), None),
        }

    def completed_hours(penalty):
        if hasattr(g, 'miniapp_sessions'):
            return sum(item.status == 'completed' for item in g.miniapp_sessions.get(penalty.id, [])) * 2
        return Session.query.filter_by(penalty_id=penalty.id, status='completed').count() * 2

    def penalty_payload(penalty):
        session = current_session(penalty)
        sessions = (g.miniapp_sessions.get(penalty.id, []) if hasattr(g, 'miniapp_sessions')
                    else Session.query.filter_by(penalty_id=penalty.id).order_by(Session.id.desc()).all())
        latest = session or next(iter(sessions), None)
        return {
            'id': penalty.id, 'student_id': penalty.student_id, 'student_name': penalty.student_name,
            'description': penalty.description or '', 'pool_id': penalty.pool_id,
            'total_hours': penalty.hours * penalty.multiplier,
            'completed_hours': completed_hours(penalty),
            'workoff_status': penalty.workoff_status, 'session': session_payload(latest),
            'sessions': [session_payload(item) for item in sessions],
            'legacy_ends_at': iso(legacy_deadline(penalty, session)),
        }

    def result(penalty, **extra):
        payload = {'penalty': penalty_payload(penalty), 'server_now': iso(context['_utcnow']()), **extra}
        db.session.commit()
        return jsonify(payload)

    def eligible_tasks(session, excluded=(), legacy_deadline=None):
        excluded = set(excluded)
        now = context['_utcnow']()
        deadline = session.ends_at if session else legacy_deadline
        remaining = SESSION_SECONDS if not deadline else max(0, (deadline - now).total_seconds())
        if session:
            excluded.update(row.task_key for row in Task.query.filter_by(session_id=session.id).all())
        return [item for item in catalog if item['id'] not in excluded
                and item['estimated_minutes'] * 60 <= remaining]

    def legacy_deadline(penalty, session):
        if not session and penalty.workoff_status == 'in_workoff' and penalty.date_worked_off:
            return penalty.date_worked_off + timedelta(seconds=SESSION_SECONDS)
        return None

    def assign_task(session, candidate, draft_id=None):
        task = Task(
            session_id=session.id, task_key=candidate['id'], title=candidate['title'],
            description=candidate['description'], estimated_minutes=candidate['estimated_minutes'],
            assigned_by=g.user.id, assigned_by_nick=g.user.nick, draft_id=draft_id,
        )
        db.session.add(task)
        db.session.flush()
        return task

    def ensure_open(penalty):
        if penalty.workoff_status not in OPEN_STATUSES:
            raise MiniAppProblem('Пенальти уже изменилось. Обнови список', 409, 'penalty_changed')

    @app.post('/api/penalty-miniapp/auth')
    def penalty_miniapp_auth():
        try:
            telegram_user = validate_telegram_init_data(body().get('init_data'), context['TELEGRAM_BOT_TOKEN'])
        except ValueError as error:
            raise MiniAppProblem(str(error), 401, 'invalid_telegram_data') from error
        account = context['_telegram_account_from_tg'](telegram_user)
        user = db.session.get(User, account.user_id) if account else None
        if not user or not user.active:
            raise MiniAppProblem('Сначала привяжи Telegram через /start в боте платформы', 403, 'telegram_not_linked')
        if context['must_change_password'](user):
            raise MiniAppProblem('Сначала смени начальный пароль на платформе', 403, 'password_change_required')
        context['_bind_request_user'](user)
        _, error = context['_active_pool_id_for_request']()
        if error:
            return error
        token = login_signer.dumps({
            'id': user.id, 'telegram_id': telegram_user['id'],
            'credential_version': context['_credential_version'](user),
        })
        return jsonify({'token': token, 'user': context['_session_user_dict'](user)})

    @app.get('/api/penalty-miniapp')
    @require_access
    def penalty_miniapp_bootstrap():
        penalties = Penalty.query.filter(Penalty.pool_id == g.miniapp_pool_id,
                                        Penalty.workoff_status.in_(OPEN_STATUSES)).order_by(Penalty.student_name, Penalty.id).all()
        # The bootstrap remains a constant number of queries as the pool grows.
        g.miniapp_sessions, g.miniapp_tasks = {}, {}
        ids = [item.id for item in penalties]
        sessions = Session.query.filter(Session.penalty_id.in_(ids)).order_by(Session.id.desc()).all() if ids else []
        for item in sessions:
            g.miniapp_sessions.setdefault(item.penalty_id, []).append(item)
        if sessions:
            for item in Task.query.filter(Task.session_id.in_([row.id for row in sessions])).order_by(Task.id).all():
                g.miniapp_tasks.setdefault(item.session_id, []).append(item)
        return jsonify({
            'user': {'nick': g.user.nick}, 'pool_id': g.miniapp_pool_id,
            'catalog': catalog, 'temporary_catalog': True,
            'penalties': [penalty_payload(item) for item in penalties],
            'server_now': iso(context['_utcnow']()),
        })

    @app.get('/api/penalty-miniapp/penalties/<int:penalty_id>')
    @require_access
    def penalty_miniapp_state(penalty_id):
        return result(get_penalty(penalty_id))

    @app.get('/api/penalty-miniapp/working')
    @require_access
    def penalty_miniapp_working():
        penalties = Penalty.query.filter_by(pool_id=g.miniapp_pool_id, workoff_status='in_workoff').order_by(Penalty.student_name, Penalty.id).all()
        ids = [item.id for item in penalties]
        sessions = Session.query.filter(Session.penalty_id.in_(ids), Session.status == 'active').all() if ids else []
        by_penalty = {item.penalty_id: item for item in sessions}
        tasks = Task.query.filter(Task.session_id.in_([item.id for item in sessions]), Task.status == 'active').all() if sessions else []
        by_session = {item.session_id: item for item in tasks}
        return jsonify({'workers': [{
            'id': item.id, 'student_name': item.student_name, 'total_hours': item.hours * item.multiplier,
            'workoff_status': item.workoff_status,
            'session': {
                'id': by_penalty[item.id].id, 'status': 'active',
                'ends_at': iso(by_penalty[item.id].ends_at),
                'current_task': task_payload(by_session[by_penalty[item.id].id])
                    if by_penalty[item.id].id in by_session else None,
            } if item.id in by_penalty else None,
            'legacy_ends_at': iso(legacy_deadline(item, by_penalty.get(item.id))),
        } for item in penalties], 'server_now': iso(context['_utcnow']())})

    @app.post('/api/penalty-miniapp/penalties/<int:penalty_id>/spin')
    @require_access
    def penalty_miniapp_spin(penalty_id):
        data = body()
        penalty = get_penalty(penalty_id)
        ensure_open(penalty)
        session = current_session(penalty)
        if session and current_task(session):
            raise MiniAppProblem('Сначала заверши или замени текущее задание', 409, 'task_active')
        excluded = data.get('exclude_keys', [])
        if not isinstance(excluded, list) or len(excluded) > len(catalog) or any(not isinstance(key, str) for key in excluded):
            raise MiniAppProblem('Некорректный список заданий')
        candidates = eligible_tasks(session, excluded, legacy_deadline(penalty, session))
        if not candidates:
            raise MiniAppProblem('Подходящих заданий пока нет. Обратись к ответственному или дождись окончания отработки', 409, 'no_tasks_available')
        candidate = secrets.choice(candidates)
        token = draft_signer.dumps({
            'id': secrets.token_hex(16), 'user_id': g.user.id, 'pool_id': penalty.pool_id,
            'penalty_id': penalty.id, 'task_key': candidate['id'],
            'session_id': session.id if session else None,
        })
        return jsonify({'task': candidate, 'draft_token': token, 'server_now': iso(context['_utcnow']())})

    @app.post('/api/penalty-miniapp/penalties/<int:penalty_id>/commit')
    @require_access
    def penalty_miniapp_commit(penalty_id):
        try:
            draft = draft_signer.loads(body().get('draft_token', ''), max_age=DRAFT_MAX_AGE)
        except (BadSignature, TypeError, ValueError) as error:
            raise MiniAppProblem('Выбери задание заново: предпросмотр устарел', 409, 'draft_expired') from error
        if (not isinstance(draft, dict) or draft.get('user_id') != g.user.id
                or draft.get('penalty_id') != penalty_id or draft.get('pool_id') != g.miniapp_pool_id):
            raise MiniAppProblem('Этот предпросмотр недоступен', 403, 'invalid_draft')
        penalty = get_penalty(penalty_id, lock=True)
        used = Task.query.filter_by(draft_id=draft['id']).first()
        if used:
            return result(penalty, duplicate=True)
        ensure_open(penalty)
        session = current_session(penalty)
        if (session.id if session else None) != draft.get('session_id'):
            raise MiniAppProblem('Другой волонтёр уже начал отработку. Обнови данные', 409, 'session_changed')
        if session and current_task(session):
            raise MiniAppProblem('Задание уже выдано. Обнови данные', 409, 'task_active')
        candidate = next((item for item in eligible_tasks(session, legacy_deadline=legacy_deadline(penalty, session)) if item['id'] == draft.get('task_key')), None)
        if not candidate:
            raise MiniAppProblem('Это задание больше не подходит. Прокрути ещё раз', 409, 'task_unavailable')
        if not session:
            started_at = (penalty.date_worked_off if penalty.workoff_status == 'in_workoff'
                          and penalty.date_worked_off else context['_utcnow']())
            if started_at + timedelta(seconds=SESSION_SECONDS) <= context['_utcnow']():
                raise MiniAppProblem('Отработка уже начата ранее и таймер истёк. Подтверди её в разделе «Штрафы»', 409, 'legacy_session_elapsed')
            session = Session(penalty_id=penalty.id, started_at=started_at,
                              ends_at=started_at + timedelta(seconds=SESSION_SECONDS), started_by=g.user.id)
            db.session.add(session)
            db.session.flush()
            if penalty.workoff_status != 'in_workoff':
                context['_set_penalty_status_from_bot'](penalty, 'in_workoff', g.user, 'Мини-ап: задание зафиксировано, начата двухчасовая отработка')
            context['_cancel_pending_notifications']('penalty', penalty.id, ['penalty_method_question'])
        try:
            assign_task(session, candidate, draft['id'])
            context['log_action']('assign_task', 'penalty', penalty.id,
                                  f'Задание: {candidate["title"]}', {'session_id': session.id}, actor=g.user)
            return result(penalty, duplicate=False)
        except IntegrityError as error:
            db.session.rollback()
            raise MiniAppProblem('Данные уже изменились. Обнови отработку', 409, 'session_changed') from error

    @app.post('/api/penalty-miniapp/penalties/<int:penalty_id>/task-action')
    @require_access
    def penalty_miniapp_task_action(penalty_id):
        data = body()
        action, request_id = data.get('action'), data.get('request_id')
        if action not in {'complete', 'replace'} or not isinstance(request_id, str) or not 16 <= len(request_id) <= 64:
            raise MiniAppProblem('Некорректное действие с заданием')
        penalty = get_penalty(penalty_id, lock=True)
        ensure_open(penalty)
        session = current_session(penalty)
        if not session or penalty.workoff_status != 'in_workoff':
            raise MiniAppProblem('Активная отработка не найдена', 409, 'session_changed')
        if type(data.get('task_id')) is not int:
            raise MiniAppProblem('Некорректное задание')
        task = Task.query.filter_by(id=data['task_id'], session_id=session.id).first()
        if task and task.close_request_id == request_id:
            return result(penalty, duplicate=True)
        if not task or task.status != 'active':
            raise MiniAppProblem('Другой волонтёр уже изменил задание. Обнови данные', 409, 'task_changed')
        if session.ends_at <= context['_utcnow']():
            raise MiniAppProblem('Два часа истекли. Подтверди завершение отработки', 409, 'session_elapsed')
        task.status = 'completed' if action == 'complete' else 'unavailable'
        task.finished_at, task.close_request_id = context['_utcnow'](), request_id
        db.session.flush()
        candidates = eligible_tasks(session)
        if candidates:
            assign_task(session, secrets.choice(candidates))
        context['log_action']('workoff_task', 'penalty', penalty.id,
                              f'Задание {task.title}: {task.status}', {'session_id': session.id}, actor=g.user)
        return result(penalty, duplicate=False, no_tasks_available=not candidates)

    @app.post('/api/penalty-miniapp/penalties/<int:penalty_id>/finish')
    @require_access
    def penalty_miniapp_finish(penalty_id):
        session_id = body().get('session_id')
        if type(session_id) is not int:
            raise MiniAppProblem('Некорректная отработка')
        penalty = get_penalty(penalty_id, lock=True)
        session = Session.query.filter_by(id=session_id, penalty_id=penalty.id).first()
        if session and session.status == 'completed':
            return result(penalty, duplicate=True)
        if not session or session.status != 'active' or penalty.workoff_status != 'in_workoff':
            raise MiniAppProblem('Отработка уже изменена. Обнови данные', 409, 'session_changed')
        if context['_utcnow']() < session.ends_at:
            raise MiniAppProblem('Два часа ещё не прошли. Завершение задания не завершает отработку', 409, 'too_early')
        active_task = current_task(session)
        if active_task:
            active_task.status, active_task.finished_at = 'completed', context['_utcnow']()
        session.status, session.finished_at, session.finished_by = 'completed', context['_utcnow'](), g.user.id
        db.session.flush()
        hours_done = completed_hours(penalty)
        total = penalty.hours * penalty.multiplier
        new_status = 'awaiting_unlock' if hours_done >= total else 'pending'
        context['_set_penalty_status_from_bot'](
            penalty, new_status, g.user, f'Мини-ап: подтверждены 2 часа; всего {hours_done} из {total} часов')
        context['_cancel_pending_notifications']('penalty', penalty.id, ['penalty_method_question', 'penalty_workoff_check'])
        events = context['_notify_admins_penalty_awaiting_unlock'](penalty) if new_status == 'awaiting_unlock' else []
        response = result(penalty, duplicate=False, remaining_hours=max(0, total - hours_done))
        if events:
            context['queue_notification_dispatch'](events)
        return response


def cancel_workoff_sessions(db, Session, Task, penalty_id, now):
    """Keep old web/bot status controls compatible with Mini App sessions."""
    ids = [item.id for item in Session.query.filter_by(penalty_id=penalty_id, status='active').all()]
    if ids:
        Task.query.filter(Task.session_id.in_(ids), Task.status == 'active').update(
            {'status': 'cancelled', 'finished_at': now}, synchronize_session=False)
        Session.query.filter(Session.id.in_(ids)).update(
            {'status': 'cancelled', 'finished_at': now}, synchronize_session=False)


def delete_workoff_sessions(db, Session, Task, penalty_ids):
    if not penalty_ids:
        return
    ids = db.session.query(Session.id).filter(Session.penalty_id.in_(penalty_ids))
    Task.query.filter(Task.session_id.in_(ids)).delete(synchronize_session=False)
    Session.query.filter(Session.penalty_id.in_(penalty_ids)).delete(synchronize_session=False)
