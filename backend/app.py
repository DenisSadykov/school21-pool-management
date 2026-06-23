import os
import json
import time
import threading
import zipfile
import xml.etree.ElementTree as ET
from io import BytesIO
from functools import wraps
from datetime import datetime, date, timedelta

from flask import Flask, jsonify, request, g, send_file
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash, check_password_hash
from itsdangerous import URLSafeTimedSerializer, BadSignature

load_dotenv()

app = Flask(__name__)

app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///pool.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key-change-me')

frontend_urls = [
    value.strip()
    for value in os.getenv('FRONTEND_URL', 'http://localhost:3000,http://localhost:3001').split(',')
    if value.strip()
]
CORS(app, resources={r"/api/*": {"origins": frontend_urls or "*"}})

db = SQLAlchemy(app)
serializer = URLSafeTimedSerializer(app.config['SECRET_KEY'], salt='auth')

# Роли, которым нужен пароль для входа
ROLES_WITH_PASSWORD = {'team_lead', 'admin'}
ALL_ROLES = {'volunteer', 'tribe_master', 'team_lead', 'admin'}
VOLUNTEER_PROFILE_ROLES = {'volunteer', 'tribe_master', 'team_lead'}
TRIBES = ['Ленты', 'Короны', 'Олени']
TRIBE_ALIASES = {
    '1': 'Ленты',
    'a': 'Ленты',
    'ленты': 'Ленты',
    '2': 'Короны',
    'b': 'Короны',
    'короны': 'Короны',
    '3': 'Олени',
    'c': 'Олени',
    'олени': 'Олени',
}
STUDENT_EVENT_POINTS = {
    'entertainment': 2,
    'education': 4,
}
STUDENT_EVENT_STATUSES = {'pending', 'confirmed', 'rejected'}
REWARD_RATES = {
    'first_day_hour': 15,
    'exam_hour': 15,
    'first_week_or_weekend_hour': 8,
    'subsequent_weekday_hour': 5,
    'group_review': 25,
    'confession': 25,
    'tribe_master_event': 30,
    'team_lead': 450,
}
REWARD_EVENT_TYPES = {
    'confession': {'label': 'Исповедь', 'coins': REWARD_RATES['confession']},
}

# Синхронизация сайт -> Google Sheets через Apps Script Web App
SYNC_WEBHOOK_URL = os.getenv('SYNC_WEBHOOK_URL', '')
SYNC_SECRET = os.getenv('SYNC_SECRET', '')
SYNC_INTERVAL = int(os.getenv('SYNC_INTERVAL', '15'))  # сек
BACKUP_DIR = os.getenv('BACKUP_DIR', os.path.join(os.path.dirname(__file__), 'backups'))
BACKUP_INTERVAL = int(os.getenv('BACKUP_INTERVAL', str(60 * 60)))  # сек
_sync_lock = threading.Lock()
_backup_lock = threading.Lock()
_runtime_started = False

# ==================== Модели ====================


class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    nick = db.Column(db.String(100), unique=True, nullable=False)
    name = db.Column(db.String(100))
    role = db.Column(db.String(20), nullable=False, default='volunteer')
    is_group_reviewer = db.Column(db.Boolean, default=False)
    has_confession = db.Column(db.Boolean, default=False)
    coins_adjustment = db.Column(db.Integer, default=0)
    password_hash = db.Column(db.String(255))  # только для team_lead / admin
    telegram = db.Column(db.String(100))
    tribe = db.Column(db.String(50))
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'nick': self.nick,
            'name': self.name or self.nick,
            'role': self.role,
            'is_group_reviewer': bool(self.is_group_reviewer),
            'has_confession': bool(self.has_confession),
            'coins_adjustment': self.coins_adjustment or 0,
            'telegram': self.telegram,
            'tribe': self.tribe,
            'active': self.active,
            'has_password': bool(self.password_hash),
        }


class Pool(db.Model):
    __tablename__ = 'pools'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    start_date = db.Column(db.Date)
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'active': self.active,
        }


class ShiftBlock(db.Model):
    """Тайм-блок смены: день + интервал времени. На него записывается N волонтёров."""
    __tablename__ = 'shift_blocks'
    id = db.Column(db.Integer, primary_key=True)
    pool_id = db.Column(db.Integer, db.ForeignKey('pools.id'), nullable=False)
    date = db.Column(db.Date, nullable=False)
    time_start = db.Column(db.String(5), nullable=False)  # "10:00"
    time_end = db.Column(db.String(5), nullable=False)    # "14:00"
    label = db.Column(db.String(50), default='')          # '', 'EXAM', ...
    capacity = db.Column(db.Integer)                       # None = без лимита
    generation_id = db.Column(db.Integer, db.ForeignKey('schedule_generations.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class ScheduleGeneration(db.Model):
    __tablename__ = 'schedule_generations'
    id = db.Column(db.Integer, primary_key=True)
    pool_id = db.Column(db.Integer, db.ForeignKey('pools.id'), nullable=False)
    end_date = db.Column(db.Date)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Signup(db.Model):
    """Запись одного волонтёра на один тайм-блок (одна строка = один человек)."""
    __tablename__ = 'signups'
    id = db.Column(db.Integer, primary_key=True)
    block_id = db.Column(db.Integer, db.ForeignKey('shift_blocks.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    __table_args__ = (db.UniqueConstraint('block_id', 'user_id', name='uq_block_user'),)


class RewardEvent(db.Model):
    __tablename__ = 'reward_events'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    event_type = db.Column(db.String(50), nullable=False)
    event_date = db.Column(db.Date)
    quantity = db.Column(db.Integer, default=1)
    coins = db.Column(db.Integer, nullable=False)
    comment = db.Column(db.Text)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class GroupReview(db.Model):
    __tablename__ = 'group_reviews'
    id = db.Column(db.Integer, primary_key=True)
    pool_id = db.Column(db.Integer)
    review_date = db.Column(db.Date, nullable=False)
    time_start = db.Column(db.String(5), nullable=False)
    flow = db.Column(db.String(50), nullable=False)
    quantity = db.Column(db.Integer, default=1)
    reviewer_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Student(db.Model):
    __tablename__ = 'students'
    id = db.Column(db.Integer, primary_key=True)
    nick = db.Column(db.String(100), unique=True, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    tribe = db.Column(db.String(50))
    pool_id = db.Column(db.Integer)
    total_penalty_hours = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class StudentEvent(db.Model):
    __tablename__ = 'student_events'
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False)
    event_type = db.Column(db.String(30), nullable=False)  # entertainment, education
    event_date = db.Column(db.Date)
    post_url = db.Column(db.String(500))
    proof_url = db.Column(db.String(500))
    points = db.Column(db.Integer, default=0)
    status = db.Column(db.String(20), default='pending')
    comment = db.Column(db.Text)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class TribeEvent(db.Model):
    __tablename__ = 'tribe_events'
    id = db.Column(db.Integer, primary_key=True)
    pool_id = db.Column(db.Integer)
    tribe = db.Column(db.String(50), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    event_date = db.Column(db.Date, nullable=False)
    time_start = db.Column(db.String(5))
    location = db.Column(db.String(200))
    comment = db.Column(db.Text)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class StudentPenalty(db.Model):
    __tablename__ = 'student_penalties'
    id = db.Column(db.Integer, primary_key=True)
    student_name = db.Column(db.String(100), nullable=False)
    volunteer_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    volunteer_name = db.Column(db.String(100))
    hours = db.Column(db.Integer, default=2)
    multiplier = db.Column(db.Integer, default=1)
    workoff_status = db.Column(db.String(20), default='pending')  # pending, done, overdue
    description = db.Column(db.Text)
    date_issued = db.Column(db.DateTime, default=datetime.utcnow)
    date_worked_off = db.Column(db.DateTime)
    pool_id = db.Column(db.Integer)


class PenaltyHistory(db.Model):
    __tablename__ = 'penalty_history'
    id = db.Column(db.Integer, primary_key=True)
    penalty_id = db.Column(db.Integer, nullable=False)
    old_status = db.Column(db.String(20))
    new_status = db.Column(db.String(20), nullable=False)
    old_hours = db.Column(db.Integer)
    new_hours = db.Column(db.Integer)
    actor_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    actor_nick = db.Column(db.String(100))
    actor_name = db.Column(db.String(100))
    comment = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class ActionLog(db.Model):
    __tablename__ = 'action_logs'
    id = db.Column(db.Integer, primary_key=True)
    actor_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    actor_nick = db.Column(db.String(100))
    actor_name = db.Column(db.String(100))
    action = db.Column(db.String(80), nullable=False)
    entity = db.Column(db.String(50), nullable=False)
    entity_id = db.Column(db.Integer)
    description = db.Column(db.Text)
    payload = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class SyncOutbox(db.Model):
    """Очередь на гарантированную доставку в Google Sheets (сайт -> таблица)."""
    __tablename__ = 'sync_outbox'
    id = db.Column(db.Integer, primary_key=True)
    entity = db.Column(db.String(50), nullable=False)   # 'signup', 'penalty', ...
    action = db.Column(db.String(20), nullable=False)   # 'create', 'delete', 'update'
    payload = db.Column(db.Text)                          # JSON
    status = db.Column(db.String(20), default='pending')  # pending, sent, error
    attempts = db.Column(db.Integer, default=0)
    error = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    sent_at = db.Column(db.DateTime)


def enqueue_sync(entity, action, payload):
    """Положить изменение в outbox. Реальный пуш в таблицу — воркером (День 2)."""
    item = SyncOutbox(entity=entity, action=action, payload=json.dumps(payload, ensure_ascii=False))
    db.session.add(item)
    # commit делает вызывающий код вместе со своей транзакцией


def _actor_snapshot(user):
    if not user:
        return None, None, None
    return user.id, user.nick, user.name or user.nick


def log_action(action, entity, entity_id=None, description='', payload=None, actor=None):
    actor = actor or getattr(g, 'user', None)
    actor_id, actor_nick, actor_name = _actor_snapshot(actor)
    db.session.add(ActionLog(
        actor_id=actor_id,
        actor_nick=actor_nick,
        actor_name=actor_name,
        action=action,
        entity=entity,
        entity_id=entity_id,
        description=description,
        payload=json.dumps(payload or {}, ensure_ascii=False),
    ))


def add_penalty_history(penalty, old_status, new_status, old_hours, comment=''):
    actor_id, actor_nick, actor_name = _actor_snapshot(getattr(g, 'user', None))
    db.session.add(PenaltyHistory(
        penalty_id=penalty.id,
        old_status=old_status,
        new_status=new_status,
        old_hours=old_hours,
        new_hours=penalty.hours * penalty.multiplier,
        actor_id=actor_id,
        actor_nick=actor_nick,
        actor_name=actor_name,
        comment=comment,
    ))


def process_outbox_once():
    """Отправить накопленные изменения в Google Sheets (Apps Script Web App).

    Гарантия доставки: пока строка не отправлена успешно, она остаётся в очереди
    (pending/error) и будет повторяться. Блокировка не даёт двум запускам
    отправить одно и то же дважды.
    """
    if not SYNC_WEBHOOK_URL:
        return {'ok': False, 'reason': 'not_configured', 'sent': 0}
    if not _sync_lock.acquire(blocking=False):
        return {'ok': True, 'sent': 0, 'skipped': True}
    try:
        items = (SyncOutbox.query
                 .filter(SyncOutbox.status.in_(['pending', 'error']))
                 .order_by(SyncOutbox.id)
                 .limit(200).all())
        if not items:
            return {'ok': True, 'sent': 0}

        body = {
            'secret': SYNC_SECRET,
            'items': [{
                'id': i.id,
                'entity': i.entity,
                'action': i.action,
                'payload': json.loads(i.payload or '{}'),
            } for i in items],
        }
        try:
            import requests
            resp = requests.post(SYNC_WEBHOOK_URL, json=body, timeout=20)
            data = resp.json() if resp.content else {}
        except Exception as e:  # сеть/таймаут/невалидный JSON
            for i in items:
                i.attempts += 1
                i.status = 'error'
                i.error = str(e)[:500]
            db.session.commit()
            return {'ok': False, 'error': str(e), 'sent': 0}

        if resp.status_code == 200 and isinstance(data, dict) and data.get('ok'):
            processed = set(data.get('processed') or [i.id for i in items])
            now = datetime.utcnow()
            sent = 0
            for i in items:
                if i.id in processed:
                    i.status = 'sent'
                    i.sent_at = now
                    i.error = None
                    sent += 1
                else:
                    i.attempts += 1
                    i.status = 'error'
            db.session.commit()
            return {'ok': True, 'sent': sent}

        err = (data.get('error') if isinstance(data, dict) else None) or f'HTTP {resp.status_code}'
        for i in items:
            i.attempts += 1
            i.status = 'error'
            i.error = str(err)[:500]
        db.session.commit()
        return {'ok': False, 'error': err, 'sent': 0}
    finally:
        _sync_lock.release()


def sync_worker_loop():
    """Фоновый цикл: периодически досылает очередь в таблицу."""
    while True:
        try:
            if SYNC_WEBHOOK_URL:
                with app.app_context():
                    process_outbox_once()
        except Exception as e:
            print('[sync] worker error:', e)
        time.sleep(SYNC_INTERVAL)


def start_sync_worker():
    t = threading.Thread(target=sync_worker_loop, daemon=True)
    t.start()
    print(f'[sync] воркер запущен, интервал {SYNC_INTERVAL}s, webhook={"да" if SYNC_WEBHOOK_URL else "НЕ настроен"}')


# ==================== Авторизация ====================


def make_token(user):
    return serializer.dumps({'id': user.id, 'role': user.role})


def load_user_from_request():
    auth = request.headers.get('Authorization', '')
    token = request.args.get('token')
    if not token:
        if not auth.startswith('Bearer '):
            return None
        token = auth[7:]
    try:
        data = serializer.loads(token, max_age=60 * 60 * 24 * 30)  # 30 дней
    except BadSignature:
        return None
    return User.query.get(data.get('id'))


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = load_user_from_request()
        if not user:
            return jsonify({'error': 'Не авторизован'}), 401
        g.user = user
        return fn(*args, **kwargs)
    return wrapper


def require_role(*roles):
    def deco(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = load_user_from_request()
            if not user:
                return jsonify({'error': 'Не авторизован'}), 401
            if user.role not in roles:
                return jsonify({'error': 'Недостаточно прав'}), 403
            g.user = user
            return fn(*args, **kwargs)
        return wrapper
    return deco


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'timestamp': datetime.utcnow().isoformat()})


@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json or {}
    nick = (data.get('nick') or '').strip()
    password = data.get('password') or ''
    if not nick:
        return jsonify({'error': 'Укажите ник'}), 400

    user = User.query.filter(db.func.lower(User.nick) == nick.lower()).first()
    if not user or not user.active:
        return jsonify({'error': 'Тебя нет в системе. Обратись к тимлиду, чтобы внесли твой ник.'}), 403

    if user.role in ROLES_WITH_PASSWORD:
        if not user.password_hash or not check_password_hash(user.password_hash, password):
            return jsonify({'error': 'Неверный пароль'}), 403

    return jsonify({'token': make_token(user), 'user': user.to_dict()})


@app.route('/api/auth/me', methods=['GET'])
@require_auth
def me():
    return jsonify(g.user.to_dict())


# ==================== Пользователи (волонтёры) ====================


@app.route('/api/users', methods=['GET'])
@require_role('team_lead', 'admin')
def list_users():
    role = request.args.get('role')
    q = User.query
    if role:
        q = q.filter_by(role=role)
    users = q.order_by(User.nick).all()
    return jsonify([u.to_dict() for u in users])


@app.route('/api/users', methods=['POST'])
@require_role('team_lead', 'admin')
def create_user():
    data = request.json or {}
    nick = (data.get('nick') or '').strip()
    role = data.get('role', 'volunteer')
    if not nick:
        return jsonify({'error': 'Укажите ник'}), 400
    if role not in ALL_ROLES:
        return jsonify({'error': 'Неизвестная роль'}), 400
    # тимлид может заводить только волонтёров и трайб-мастеров
    if g.user.role == 'team_lead' and role in ROLES_WITH_PASSWORD:
        return jsonify({'error': 'Только админ может создавать тимлидов и админов'}), 403
    if User.query.filter(db.func.lower(User.nick) == nick.lower()).first():
        return jsonify({'error': 'Такой ник уже есть'}), 409

    user = User(
        nick=nick,
        name=data.get('name') or nick,
        role=role,
        telegram=data.get('telegram'),
        tribe=normalize_tribe(data.get('tribe')),
    )
    if role in ROLES_WITH_PASSWORD:
        password = data.get('password') or ''
        if len(password) < 4:
            return jsonify({'error': 'Для этой роли нужен пароль (мин. 4 символа)'}), 400
        user.password_hash = generate_password_hash(password)
    db.session.add(user)
    db.session.commit()
    return jsonify(user.to_dict()), 201


@app.route('/api/users/<int:user_id>', methods=['DELETE'])
@require_role('team_lead', 'admin')
def delete_user(user_id):
    user = User.query.get_or_404(user_id)
    if user.role in ROLES_WITH_PASSWORD and g.user.role != 'admin':
        return jsonify({'error': 'Только админ может удалять тимлидов и админов'}), 403
    Signup.query.filter_by(user_id=user.id).delete()
    db.session.delete(user)
    db.session.commit()
    return jsonify({'message': 'Удалён'})


# ==================== Бассейны ====================


@app.route('/api/pools', methods=['GET'])
@require_auth
def list_pools():
    pools = Pool.query.order_by(Pool.created_at.desc()).all()
    return jsonify([p.to_dict() for p in pools])


@app.route('/api/pools/active', methods=['GET'])
@require_auth
def active_pool():
    pool = Pool.query.filter_by(active=True).order_by(Pool.created_at.desc()).first()
    return jsonify(pool.to_dict() if pool else None)


@app.route('/api/pools', methods=['POST'])
@require_role('team_lead', 'admin')
def create_pool():
    data = request.json or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Укажите название бассейна'}), 400
    start_date = None
    if data.get('start_date'):
        start_date = datetime.fromisoformat(data['start_date']).date()
    # делаем новый бассейн активным, остальные — нет
    if data.get('active', True):
        Pool.query.update({Pool.active: False})
    pool = Pool(name=name, start_date=start_date, active=data.get('active', True))
    db.session.add(pool)
    db.session.commit()
    return jsonify(pool.to_dict()), 201


@app.route('/api/pools/<int:pool_id>/activate', methods=['POST'])
@require_role('team_lead', 'admin')
def activate_pool(pool_id):
    pool = Pool.query.get_or_404(pool_id)
    Pool.query.update({Pool.active: False})
    pool.active = True
    db.session.commit()
    return jsonify(pool.to_dict())


# ==================== Тайм-блоки и запись ====================


def block_to_dict(block, signups_by_block):
    rows = signups_by_block.get(block.id, [])
    return {
        'id': block.id,
        'pool_id': block.pool_id,
        'date': block.date.isoformat(),
        'time_start': block.time_start,
        'time_end': block.time_end,
        'label': block.label or '',
        'capacity': block.capacity,
        'volunteers': [{
            'user_id': uid,
            'nick': nick,
            'name': name or nick,
            'telegram': telegram,
            'role': role,
        } for uid, nick, name, telegram, role in rows],
        'count': len(rows),
    }


def _signups_index(pool_id):
    """Вернуть {block_id: [(user_id, nick, name, telegram, role), ...]} для бассейна."""
    rows = (
        db.session.query(Signup.block_id, User.id, User.nick, User.name, User.telegram, User.role)
        .join(User, User.id == Signup.user_id)
        .join(ShiftBlock, ShiftBlock.id == Signup.block_id)
        .filter(ShiftBlock.pool_id == pool_id)
        .order_by(Signup.created_at)
        .all()
    )
    index = {}
    for block_id, uid, nick, name, telegram, role in rows:
        index.setdefault(block_id, []).append((uid, nick, name, telegram, role))
    return index


@app.route('/api/schedule', methods=['GET'])
@require_auth
def schedule():
    """Сетка графика: дни -> тайм-блоки -> волонтёры."""
    pool_id = request.args.get('pool_id', type=int)
    if not pool_id:
        pool = Pool.query.filter_by(active=True).order_by(Pool.created_at.desc()).first()
        if not pool:
            return jsonify({'pool': None, 'days': []})
        pool_id = pool.id
    pool = Pool.query.get_or_404(pool_id)

    blocks = ShiftBlock.query.filter_by(pool_id=pool_id).order_by(
        ShiftBlock.date, ShiftBlock.time_start
    ).all()
    index = _signups_index(pool_id)

    days = {}
    for b in blocks:
        key = b.date.isoformat()
        days.setdefault(key, []).append(block_to_dict(b, index))

    days_list = [{'date': d, 'blocks': blocks} for d, blocks in sorted(days.items())]
    return jsonify({'pool': pool.to_dict(), 'days': days_list})


@app.route('/api/blocks', methods=['POST'])
@require_role('team_lead', 'admin')
def create_block():
    data = request.json or {}
    pool_id = data.get('pool_id')
    if not pool_id:
        pool = Pool.query.filter_by(active=True).first()
        pool_id = pool.id if pool else None
    if not pool_id:
        return jsonify({'error': 'Нет активного бассейна'}), 400
    try:
        d = datetime.fromisoformat(data['date']).date()
    except (KeyError, ValueError):
        return jsonify({'error': 'Некорректная дата'}), 400
    block = ShiftBlock(
        pool_id=pool_id,
        date=d,
        time_start=data.get('time_start', '10:00'),
        time_end=data.get('time_end', '14:00'),
        label=data.get('label', ''),
        capacity=data.get('capacity'),
    )
    db.session.add(block)
    db.session.commit()
    return jsonify({'id': block.id, 'message': 'Тайм-блок создан'}), 201


@app.route('/api/blocks/<int:block_id>', methods=['DELETE'])
@require_role('team_lead', 'admin')
def delete_block(block_id):
    block = ShiftBlock.query.get_or_404(block_id)
    Signup.query.filter_by(block_id=block.id).delete()
    db.session.delete(block)
    db.session.commit()
    return jsonify({'message': 'Тайм-блок удалён'})


@app.route('/api/blocks/<int:block_id>/capacity', methods=['PATCH'])
@require_role('team_lead', 'admin')
def patch_block_capacity(block_id):
    block = ShiftBlock.query.get_or_404(block_id)
    data = request.json or {}
    if 'capacity' in data:
        val = data['capacity']
        block.capacity = int(val) if val is not None else None
    else:
        delta = int(data.get('delta', 1))
        base = block.capacity if block.capacity is not None else Signup.query.filter_by(block_id=block.id).count()
        new_cap = base + delta
        if delta < 0:
            current_count = Signup.query.filter_by(block_id=block.id).count()
            new_cap = max(current_count, new_cap)
        block.capacity = max(1, new_cap)
    db.session.commit()
    return jsonify({'id': block.id, 'capacity': block.capacity})


# Стандартный шаблон расписания School21 pool
# (время_от, время_до, метка, capacity)
_SCHEDULE_TPL = {
    'opening': [('09:00', '19:00', '', 7), ('19:00', '20:00', '', 2)],
    0: [('10:00', '14:00', '', 4), ('15:00', '19:00', '', 4)],   # Пн
    1: [('10:00', '14:00', '', 4), ('15:00', '19:00', '', 4)],   # Вт
    2: [('10:00', '14:00', '', 2), ('15:00', '19:00', '', 2)],   # Ср
    3: [('11:00', '17:00', 'EXAM', 5)],                           # Чт — экзамен
    4: [('10:00', '14:00', '', 2), ('15:00', '19:00', '', 2)],   # Пт
    5: [('10:00', '14:00', '', 2), ('15:00', '19:00', '', 2)],   # Сб
    6: [('10:00', '14:00', '', 2), ('15:00', '19:00', '', 2)],   # Вс
}


@app.route('/api/pools/<int:pool_id>/generate-schedule', methods=['POST'])
@require_role('team_lead', 'admin')
def generate_schedule(pool_id):
    pool = Pool.query.get_or_404(pool_id)
    if not pool.start_date:
        return jsonify({'error': 'У бассейна не задана дата начала'}), 400
    data = request.json or {}
    try:
        end_date = datetime.fromisoformat(data['end_date']).date()
    except (KeyError, ValueError):
        return jsonify({'error': 'Укажите end_date (YYYY-MM-DD)'}), 400
    if end_date < pool.start_date:
        return jsonify({'error': 'Дата окончания раньше даты начала'}), 400

    created = 0
    generation = ScheduleGeneration(pool_id=pool.id, end_date=end_date, created_by=g.user.id)
    db.session.add(generation)
    db.session.flush()
    current = pool.start_date
    is_opening = True
    while current <= end_date:
        tpl = _SCHEDULE_TPL['opening'] if is_opening else _SCHEDULE_TPL[current.weekday()]
        for t1, t2, label, cap in tpl:
            db.session.add(ShiftBlock(
                pool_id=pool_id, date=current,
                time_start=t1, time_end=t2, label=label, capacity=cap,
                generation_id=generation.id,
            ))
            created += 1
        current += timedelta(days=1)
        is_opening = False

    db.session.commit()
    return jsonify({'created': created, 'message': f'Создано {created} тайм-блоков'})


@app.route('/api/pools/<int:pool_id>/generate-schedule/undo', methods=['POST'])
@require_role('team_lead', 'admin')
def undo_generate_schedule(pool_id):
    generation = (
        ScheduleGeneration.query
        .filter_by(pool_id=pool_id)
        .order_by(ScheduleGeneration.created_at.desc(), ScheduleGeneration.id.desc())
        .first()
    )
    if not generation:
        return jsonify({'error': 'Нет последней генерации для отмены'}), 404
    blocks = ShiftBlock.query.filter_by(pool_id=pool_id, generation_id=generation.id).all()
    block_ids = [block.id for block in blocks]
    if block_ids:
        Signup.query.filter(Signup.block_id.in_(block_ids)).delete(synchronize_session=False)
        ShiftBlock.query.filter(ShiftBlock.id.in_(block_ids)).delete(synchronize_session=False)
    db.session.delete(generation)
    db.session.commit()
    return jsonify({'deleted': len(block_ids), 'message': f'Удалено тайм-блоков: {len(block_ids)}'})


@app.route('/api/blocks/<int:block_id>/signup', methods=['POST'])
@require_auth
def signup_block(block_id):
    block = ShiftBlock.query.get_or_404(block_id)
    user = g.user
    data = request.json or {}
    target_id = data.get('user_id')
    if target_id and user.role in ('team_lead', 'admin'):
        target_user = User.query.get_or_404(int(target_id))
    elif target_id:
        return jsonify({'error': 'Назначать других людей может только тимлид или админ'}), 403
    else:
        target_user = user

    existing = Signup.query.filter_by(block_id=block.id, user_id=target_user.id).first()
    if existing:
        return jsonify({'message': 'Уже записан'}), 200
    if block.capacity is not None:
        current = Signup.query.filter_by(block_id=block.id).count()
        if current >= block.capacity:
            return jsonify({'error': 'Мест больше нет'}), 409
    signup = Signup(block_id=block.id, user_id=target_user.id)
    db.session.add(signup)
    log_action(
        'create',
        'signup',
        block.id,
        f'@{target_user.nick} записан на смену {block.date.isoformat()} {block.time_start}-{block.time_end}',
        {
            'target_user_id': target_user.id,
            'target_nick': target_user.nick,
            'date': block.date.isoformat(),
            'time_start': block.time_start,
            'time_end': block.time_end,
            'label': block.label or '',
        },
    )
    enqueue_sync('signup', 'create', {
        'nick': target_user.nick,
        'date': block.date.isoformat(),
        'time': f'{block.time_start} - {block.time_end}',
        'label': block.label or '',
        'at': datetime.utcnow().isoformat(),
    })
    db.session.commit()
    return jsonify({'message': 'Записан на смену'}), 201


@app.route('/api/blocks/<int:block_id>/signup', methods=['DELETE'])
@require_auth
def unsignup_block(block_id):
    user = g.user
    block = ShiftBlock.query.get_or_404(block_id)
    # волонтёр снимает себя; тимлид/админ может снять любого через ?user_id=
    target_id = request.args.get('user_id', type=int)
    if target_id and user.role in ('team_lead', 'admin'):
        target = target_id
    else:
        target = user.id
    signup = Signup.query.filter_by(block_id=block.id, user_id=target).first()
    if not signup:
        return jsonify({'message': 'Записи не было'}), 200
    db.session.delete(signup)
    target_user = User.query.get(target)
    log_action(
        'delete',
        'signup',
        block.id,
        f'@{target_user.nick if target_user else target} снят со смены {block.date.isoformat()} {block.time_start}-{block.time_end}',
        {
            'target_user_id': target,
            'target_nick': target_user.nick if target_user else str(target),
            'date': block.date.isoformat(),
            'time_start': block.time_start,
            'time_end': block.time_end,
            'label': block.label or '',
        },
    )
    enqueue_sync('signup', 'delete', {
        'nick': target_user.nick if target_user else str(target),
        'date': block.date.isoformat(),
        'time': f'{block.time_start} - {block.time_end}',
        'label': block.label or '',
        'at': datetime.utcnow().isoformat(),
    })
    db.session.commit()
    return jsonify({'message': 'Запись отменена'})


@app.route('/api/me/shifts', methods=['GET'])
@require_auth
def my_shifts():
    rows = (
        db.session.query(ShiftBlock)
        .join(Signup, Signup.block_id == ShiftBlock.id)
        .filter(Signup.user_id == g.user.id)
        .order_by(ShiftBlock.date, ShiftBlock.time_start)
        .all()
    )
    return jsonify([{
        'id': b.id,
        'date': b.date.isoformat(),
        'time_start': b.time_start,
        'time_end': b.time_end,
        'label': b.label or '',
    } for b in rows])


# ==================== Статистика ====================


@app.route('/api/stats', methods=['GET'])
@require_auth
def stats():
    pool = Pool.query.filter_by(active=True).order_by(Pool.created_at.desc()).first()
    pool_id = pool.id if pool else None
    total_blocks = ShiftBlock.query.filter_by(pool_id=pool_id).count() if pool_id else 0
    volunteers = User.query.filter_by(role='volunteer').count()
    total_signups = (
        db.session.query(Signup).join(ShiftBlock, ShiftBlock.id == Signup.block_id)
        .filter(ShiftBlock.pool_id == pool_id).count() if pool_id else 0
    )
    my = Signup.query.filter_by(user_id=g.user.id).count()
    return jsonify({
        'pool': pool.to_dict() if pool else None,
        'totalBlocks': total_blocks,
        'volunteers': volunteers,
        'totalSignups': total_signups,
        'mySignups': my,
    })


@app.route('/api/volunteers', methods=['GET'])
@require_auth
def get_volunteers():
    """Список людей, участвующих в волонтёрской сетке, со статусами и коинами."""
    users = User.query.filter(User.role.in_(list(VOLUNTEER_PROFILE_ROLES))).order_by(User.nick).all()
    result = []
    for user in users:
        cnt = Signup.query.filter_by(user_id=user.id).count()
        manual = user.coins_adjustment or 0
        rewards = calculate_user_rewards(user, manual)
        group_reviews_count = db.session.query(db.func.coalesce(db.func.sum(GroupReview.quantity), 0)).filter_by(reviewer_id=user.id).scalar() or 0
        result.append({
            'id': user.id,
            'nick': user.nick,
            'name': user.name or user.nick,
            'role': user.role,
            'tribe': user.tribe,
            'is_group_reviewer': bool(group_reviews_count),
            'group_reviews_count': int(group_reviews_count),
            'has_confession': bool(user.has_confession),
            'shifts_count': cnt,
            'coins': rewards['total'],
            'coins_adjustment': manual,
            'coin_breakdown': rewards['breakdown'],
        })
    order = {'team_lead': 0, 'tribe_master': 1, 'volunteer': 2}
    result.sort(key=lambda x: (order.get(x['role'], 9), x['nick']))
    return jsonify(result)


def _parse_time(value):
    return datetime.strptime(value, '%H:%M')


def _block_hours(block):
    start = _parse_time(block.time_start)
    end = _parse_time(block.time_end)
    return max(0, (end - start).seconds / 3600)


def _shift_reward_type(block, pool):
    if block.label == 'EXAM':
        return 'exam_hour', 'Экзамен', REWARD_RATES['exam_hour']
    if pool and pool.start_date and block.date == pool.start_date:
        return 'first_day_hour', 'Первый день', REWARD_RATES['first_day_hour']
    if block.date.weekday() >= 5:
        return 'first_week_or_weekend_hour', 'Выходной день', REWARD_RATES['first_week_or_weekend_hour']
    if pool and pool.start_date and block.date < pool.start_date + timedelta(days=7):
        return 'first_week_or_weekend_hour', 'Первая неделя', REWARD_RATES['first_week_or_weekend_hour']
    return 'subsequent_weekday_hour', 'Будний день после первой недели', REWARD_RATES['subsequent_weekday_hour']


def _add_reward(buckets, reward_type, label, count, coins):
    if not count and not coins:
        return
    item = buckets.setdefault(reward_type, {'type': reward_type, 'label': label, 'count': 0, 'coins': 0})
    item['count'] += count
    item['coins'] += coins


def calculate_user_rewards(user, manual_adjustment=0):
    buckets = {}
    rows = (
        db.session.query(Signup, ShiftBlock, Pool)
        .join(ShiftBlock, ShiftBlock.id == Signup.block_id)
        .join(Pool, Pool.id == ShiftBlock.pool_id)
        .filter(Signup.user_id == user.id)
        .all()
    )
    for _, block, pool in rows:
        hours = _block_hours(block)
        reward_type, label, rate = _shift_reward_type(block, pool)
        _add_reward(buckets, reward_type, label, hours, int(hours * rate))

    group_reviews = db.session.query(db.func.coalesce(db.func.sum(GroupReview.quantity), 0)).filter_by(reviewer_id=user.id).scalar() or 0
    if group_reviews:
        group_reviews = int(group_reviews)
        _add_reward(
            buckets,
            'group_review',
            'Проверка групповых',
            group_reviews,
            group_reviews * REWARD_RATES['group_review'],
        )
    if user.has_confession:
        _add_reward(buckets, 'confession', 'Исповедь', 1, REWARD_RATES['confession'])
    if user.role == 'tribe_master':
        _add_reward(buckets, 'tribe_master_event', 'Трайб-мастерство', 1, REWARD_RATES['tribe_master_event'])
    if user.role == 'team_lead':
        _add_reward(buckets, 'team_lead', 'Тимлид команды волонтёров', 1, REWARD_RATES['team_lead'])
    events = RewardEvent.query.filter(
        RewardEvent.user_id == user.id,
        RewardEvent.event_type != 'confession',
    ).all()
    for event in events:
        meta = REWARD_EVENT_TYPES.get(event.event_type, {'label': event.event_type})
        _add_reward(buckets, event.event_type, meta['label'], event.quantity or 1, event.coins)
    if manual_adjustment:
        _add_reward(buckets, 'manual', 'Ручная корректировка', 1, manual_adjustment)

    breakdown = list(buckets.values())
    return {'breakdown': breakdown, 'total': sum(item['coins'] for item in breakdown)}


def _volunteer_role_from_payload(data):
    role = data.get('role') or 'volunteer'
    if role not in ('volunteer', 'tribe_master'):
        raise ValueError('Во вкладке волонтёров можно добавлять только волонтёров и трайб-мастеров')
    return role


def _cell_column(cell_ref):
    return ''.join(ch for ch in cell_ref if ch.isalpha())


def _column_index(col):
    index = 0
    for ch in col:
        index = index * 26 + (ord(ch.upper()) - ord('A') + 1)
    return index - 1


def parse_xlsx_rows(file_storage):
    """Прочитать первый лист .xlsx в список строк. Достаточно для простых импорт-шаблонов."""
    ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    with zipfile.ZipFile(file_storage) as archive:
        shared = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            root = ET.fromstring(archive.read('xl/sharedStrings.xml'))
            for item in root.findall('m:si', ns):
                shared.append(''.join(t.text or '' for t in item.findall('.//m:t', ns)))

        sheet_path = 'xl/worksheets/sheet1.xml'
        root = ET.fromstring(archive.read(sheet_path))
        rows = []
        for row in root.findall('.//m:sheetData/m:row', ns):
            values = []
            for cell in row.findall('m:c', ns):
                col_idx = _column_index(_cell_column(cell.attrib.get('r', 'A1')))
                while len(values) <= col_idx:
                    values.append('')
                cell_type = cell.attrib.get('t')
                if cell_type == 'inlineStr':
                    value = ''.join(t.text or '' for t in cell.findall('.//m:t', ns))
                else:
                    raw = cell.find('m:v', ns)
                    value = raw.text if raw is not None and raw.text is not None else ''
                    if cell_type == 's' and value:
                        value = shared[int(value)]
                values[col_idx] = value.strip() if isinstance(value, str) else value
            if any(str(v).strip() for v in values):
                rows.append(values)
        return rows


def rows_to_dicts(rows, columns):
    if not rows:
        return []
    header_map = {
        'nick': 'nick', 'ник': 'nick', 'login': 'nick', 'логин': 'nick',
        'name': 'name', 'имя': 'name', 'фио': 'name',
        'role': 'role', 'статус': 'role', 'роль': 'role',
        'tribe': 'tribe', 'группа': 'tribe', 'триб': 'tribe',
    }
    first = [header_map.get(str(cell).strip().lower()) for cell in rows[0]]
    has_header = any(first)
    keys = first if has_header else columns
    data_rows = rows[1:] if has_header else rows
    result = []
    for row in data_rows:
        item = {}
        for index, key in enumerate(keys):
            if key and index < len(row):
                item[key] = row[index]
        result.append(item)
    return result


def normalize_tribe(value):
    raw = str(value or '').strip()
    if not raw:
        return None
    return TRIBE_ALIASES.get(raw.lower(), raw)


def tribe_master_for_tribe(tribe, exclude_user_id=None):
    if not tribe:
        return None
    query = User.query.filter_by(role='tribe_master', tribe=tribe)
    if exclude_user_id:
        query = query.filter(User.id != exclude_user_id)
    return query.first()


def validate_tribe_master_assignment(role, tribe, exclude_user_id=None):
    if role != 'tribe_master' or not tribe:
        return None
    owner = tribe_master_for_tribe(tribe, exclude_user_id)
    if owner:
        return f'Трайб "{tribe}" уже назначен @{owner.nick}'
    return None


def save_volunteer_rows(rows):
    created = 0
    updated = 0
    skipped = []

    for index, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            skipped.append({'row': index, 'reason': 'Некорректная строка'})
            continue

        nick = (row.get('nick') or '').strip()
        name = (row.get('name') or '').strip() or nick
        tribe = normalize_tribe(row.get('tribe'))
        if not nick:
            skipped.append({'row': index, 'reason': 'Нужен nick'})
            continue
        try:
            role = _volunteer_role_from_payload(row)
        except ValueError as e:
            skipped.append({'row': index, 'nick': nick, 'reason': str(e)})
            continue

        user = User.query.filter(db.func.lower(User.nick) == nick.lower()).first()
        if user:
            if user.role in ROLES_WITH_PASSWORD:
                skipped.append({'row': index, 'nick': nick, 'reason': 'Ник уже занят тимлидом или админом'})
                continue
            conflict = validate_tribe_master_assignment(role, tribe, user.id)
            if conflict:
                skipped.append({'row': index, 'nick': nick, 'reason': conflict})
                continue
            user.name = name
            user.role = role
            user.tribe = tribe
            updated += 1
        else:
            conflict = validate_tribe_master_assignment(role, tribe)
            if conflict:
                skipped.append({'row': index, 'nick': nick, 'reason': conflict})
                continue
            db.session.add(User(
                nick=nick,
                name=name,
                role=role,
                tribe=tribe,
            ))
            created += 1

    log_action(
        'import',
        'volunteer',
        None,
        f'Импорт волонтёров: новых {created}, обновлено {updated}, пропущено {len(skipped)}',
        {'created': created, 'updated': updated, 'skipped': skipped},
    )
    db.session.commit()
    return {
        'created': created,
        'updated': updated,
        'skipped': skipped,
        'message': f'Импортировано: новых {created}, обновлено {updated}, пропущено {len(skipped)}',
    }


@app.route('/api/volunteers', methods=['POST'])
@require_role('team_lead', 'admin')
def create_volunteer_profile():
    data = request.json or {}
    nick = (data.get('nick') or '').strip()
    name = (data.get('name') or '').strip() or nick
    if not nick:
        return jsonify({'error': 'Укажите ник'}), 400
    try:
        role = _volunteer_role_from_payload(data)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

    existing = User.query.filter(db.func.lower(User.nick) == nick.lower()).first()
    if existing:
        if existing.role in ROLES_WITH_PASSWORD:
            return jsonify({'error': 'Такой ник уже есть как тимлид или админ'}), 409
        return jsonify({'error': 'Такой ник уже есть'}), 409

    tribe = normalize_tribe(data.get('tribe'))
    conflict = validate_tribe_master_assignment(role, tribe)
    if conflict:
        return jsonify({'error': conflict}), 409

    user = User(
        nick=nick,
        name=name,
        role=role,
        tribe=tribe,
    )
    db.session.add(user)
    db.session.flush()
    log_action(
        'create',
        'volunteer',
        user.id,
        f'Добавлен @{user.nick} как {role}',
        {'target_nick': user.nick, 'role': role, 'tribe': tribe},
    )
    db.session.commit()
    return jsonify(user.to_dict()), 201


@app.route('/api/volunteers/import', methods=['POST'])
@require_role('team_lead', 'admin')
def import_volunteer_profiles():
    data = request.json or {}
    rows = data.get('volunteers') or []
    if not isinstance(rows, list) or not rows:
        return jsonify({'error': 'Передайте volunteers: [{nick, name, role?, tribe?}]'}), 400
    return jsonify(save_volunteer_rows(rows))


@app.route('/api/volunteers/import-file', methods=['POST'])
@require_role('team_lead', 'admin')
def import_volunteer_profiles_file():
    uploaded = request.files.get('file')
    if not uploaded:
        return jsonify({'error': 'Загрузите файл'}), 400
    try:
        rows = parse_xlsx_rows(uploaded)
        volunteers = rows_to_dicts(rows, ['nick', 'name', 'role', 'tribe'])
    except Exception as e:
        return jsonify({'error': f'Не удалось прочитать .xlsx: {e}'}), 400
    return jsonify(save_volunteer_rows(volunteers))


@app.route('/api/volunteers/<int:user_id>/reward-events', methods=['POST'])
@require_role('team_lead', 'admin')
def create_volunteer_reward_event(user_id):
    user = User.query.get_or_404(user_id)
    data = request.json or {}
    event_type = data.get('event_type') or 'confession'
    if event_type not in REWARD_EVENT_TYPES:
        return jsonify({'error': 'Неизвестный тип активности'}), 400
    if event_type == 'confession':
        user.has_confession = True
        RewardEvent.query.filter_by(user_id=user.id, event_type='confession').delete()
        db.session.commit()
        return jsonify({
            'message': f'{REWARD_EVENT_TYPES[event_type]["label"]}: +{REWARD_RATES["confession"]} коинов для @{user.nick}',
        }), 200

    try:
        quantity = max(1, int(data.get('quantity') or 1))
    except (TypeError, ValueError):
        return jsonify({'error': 'Количество должно быть числом'}), 400

    event_date = None
    if data.get('event_date'):
        try:
            event_date = datetime.fromisoformat(data['event_date']).date()
        except ValueError:
            return jsonify({'error': 'Некорректная дата'}), 400

    coins = quantity * REWARD_EVENT_TYPES[event_type]['coins']
    event = RewardEvent(
        user_id=user.id,
        event_type=event_type,
        event_date=event_date,
        quantity=quantity,
        coins=coins,
        comment=(data.get('comment') or '').strip(),
        created_by=g.user.id,
    )
    db.session.add(event)
    db.session.commit()
    return jsonify({
        'id': event.id,
        'message': f'{REWARD_EVENT_TYPES[event_type]["label"]}: +{coins} коинов для @{user.nick}',
    }), 201


@app.route('/api/volunteers/<int:user_id>', methods=['PATCH'])
@require_role('team_lead', 'admin')
def update_volunteer_profile(user_id):
    user = User.query.get_or_404(user_id)
    data = request.json or {}
    changes = {}

    if 'role' in data:
        new_role = data.get('role')
        if new_role not in ('volunteer', 'tribe_master'):
            return jsonify({'error': 'На этой странице можно выбрать только волонтёра или трайб-мастера'}), 400
        if user.role in ROLES_WITH_PASSWORD:
            return jsonify({'error': 'Тимлида или админа нельзя сделать трайб-мастером здесь'}), 403
        target_tribe = normalize_tribe(data.get('tribe')) if 'tribe' in data else user.tribe
        conflict = validate_tribe_master_assignment(new_role, target_tribe, user.id)
        if conflict:
            return jsonify({'error': conflict}), 409
        if user.role != new_role:
            changes['role'] = {'from': user.role, 'to': new_role}
        user.role = new_role

    if 'has_confession' in data:
        old_confession = bool(user.has_confession)
        user.has_confession = bool(data.get('has_confession'))
        if old_confession != user.has_confession:
            changes['has_confession'] = {'from': old_confession, 'to': user.has_confession}
        if not user.has_confession:
            RewardEvent.query.filter_by(user_id=user.id, event_type='confession').delete()

    if 'tribe' in data:
        new_tribe = normalize_tribe(data.get('tribe'))
        conflict = validate_tribe_master_assignment(user.role, new_tribe, user.id)
        if conflict:
            return jsonify({'error': conflict}), 409
        if user.tribe != new_tribe:
            changes['tribe'] = {'from': user.tribe, 'to': new_tribe}
        user.tribe = new_tribe

    if 'coins_adjustment' in data:
        try:
            new_adjustment = int(data.get('coins_adjustment') or 0)
        except (TypeError, ValueError):
            return jsonify({'error': 'coins_adjustment должен быть числом'}), 400
        if (user.coins_adjustment or 0) != new_adjustment:
            changes['coins_adjustment'] = {'from': user.coins_adjustment or 0, 'to': new_adjustment}
        user.coins_adjustment = new_adjustment

    if changes:
        log_action(
            'update',
            'volunteer',
            user.id,
            f'Обновлён профиль @{user.nick}',
            {'target_nick': user.nick, 'changes': changes},
        )
    db.session.commit()
    return jsonify(user.to_dict())


# ==================== Групповые проверки ====================


def _group_review_to_dict(review):
    reviewer = User.query.get(review.reviewer_id)
    creator = User.query.get(review.created_by) if review.created_by else None
    return {
        'id': review.id,
        'pool_id': review.pool_id,
        'date': review.review_date.isoformat(),
        'time_start': review.time_start,
        'quantity': review.quantity or 1,
        'reviewer': _user_public_dict(reviewer) if reviewer else None,
        'created_by': _user_public_dict(creator) if creator else None,
    }


@app.route('/api/group-reviews', methods=['GET'])
@require_auth
def list_group_reviews():
    pool_id = request.args.get('pool_id', type=int) or active_pool_id()
    reviews = (
        GroupReview.query
        .filter_by(pool_id=pool_id)
        .order_by(GroupReview.review_date.desc(), GroupReview.time_start)
        .all()
    )
    return jsonify([_group_review_to_dict(review) for review in reviews])


@app.route('/api/group-reviews', methods=['POST'])
@require_role('team_lead', 'admin')
def create_group_review():
    data = request.json or {}
    try:
        review_date = datetime.fromisoformat(data['date']).date()
    except (KeyError, ValueError):
        return jsonify({'error': 'Нужна дата проверки'}), 400
    reviewer_id = data.get('reviewer_id')
    reviewer = User.query.get_or_404(reviewer_id)
    try:
        quantity = max(1, int(data.get('quantity') or 1))
    except (TypeError, ValueError):
        return jsonify({'error': 'Количество проверок должно быть числом'}), 400
    review = GroupReview(
        pool_id=data.get('pool_id') or active_pool_id(),
        review_date=review_date,
        time_start=(data.get('time_start') or '10:00').strip(),
        flow='',
        quantity=quantity,
        reviewer_id=reviewer.id,
        created_by=g.user.id,
    )
    db.session.add(review)
    db.session.commit()
    return jsonify(_group_review_to_dict(review)), 201


@app.route('/api/group-reviews/<int:review_id>', methods=['DELETE'])
@require_role('team_lead', 'admin')
def delete_group_review(review_id):
    review = GroupReview.query.get_or_404(review_id)
    db.session.delete(review)
    db.session.commit()
    return jsonify({'message': 'Групповая проверка удалена'})


# ==================== Ученики ====================


def active_pool_id():
    pool = Pool.query.filter_by(active=True).order_by(Pool.created_at.desc()).first()
    return pool.id if pool else 1


def _status_counts(pool_id):
    penalties = StudentPenalty.query.filter_by(pool_id=pool_id).all() if pool_id else []
    students_with_penalties = {p.student_name for p in penalties}
    return {
        'students_with_penalties': len(students_with_penalties),
        'pending': len([p for p in penalties if p.workoff_status == 'pending']),
        'overdue': len([p for p in penalties if p.workoff_status == 'overdue']),
        'in_workoff': len([p for p in penalties if p.workoff_status in ('pending', 'overdue')]),
        'awaiting_unlock': len([p for p in penalties if p.workoff_status == 'awaiting_unlock']),
    }


def _user_public_dict(user):
    return {
        'id': user.id,
        'nick': user.nick,
        'name': user.name or user.nick,
        'telegram': user.telegram,
        'role': user.role,
        'tribe': user.tribe,
    }


def _block_with_people(block):
    signups = (
        db.session.query(Signup, User)
        .join(User, User.id == Signup.user_id)
        .filter(Signup.block_id == block.id)
        .order_by(Signup.created_at)
        .all()
    )
    return {
        'id': block.id,
        'date': block.date.isoformat(),
        'time_start': block.time_start,
        'time_end': block.time_end,
        'label': block.label or '',
        'capacity': block.capacity,
        'count': len(signups),
        'volunteers': [_user_public_dict(user) for _, user in signups],
    }


def _tomorrow_blocks(pool_id):
    tomorrow = date.today() + timedelta(days=1)
    blocks = ShiftBlock.query.filter_by(pool_id=pool_id, date=tomorrow).order_by(ShiftBlock.time_start).all()
    return [_block_with_people(block) for block in blocks]


def _future_my_shifts(user_id, limit=5):
    today = date.today()
    rows = (
        db.session.query(ShiftBlock)
        .join(Signup, Signup.block_id == ShiftBlock.id)
        .filter(Signup.user_id == user_id, ShiftBlock.date >= today)
        .order_by(ShiftBlock.date, ShiftBlock.time_start)
        .limit(limit)
        .all()
    )
    return [_block_with_people(block) for block in rows]


def _tribes_for_pool(pool_id):
    rows = (
        db.session.query(Student.tribe)
        .filter(Student.pool_id == pool_id, Student.tribe.isnot(None))
        .distinct()
        .order_by(Student.tribe)
        .all()
    )
    found = [normalize_tribe(row[0]) for row in rows if row[0]]
    return list(dict.fromkeys([*TRIBES, *found]))


def _resolve_user_tribe(user, pool_id):
    if user.tribe:
        return user.tribe
    tribes = _tribes_for_pool(pool_id)
    return tribes[0] if tribes else TRIBES[0]


def _tribe_metrics(pool_id, tribe):
    students = Student.query.filter_by(pool_id=pool_id, tribe=tribe).all() if pool_id and tribe else []
    student_ids = [s.id for s in students]
    events = (
        StudentEvent.query
        .filter(StudentEvent.student_id.in_(student_ids), StudentEvent.status == 'confirmed')
        .all()
        if student_ids else []
    )
    entertainment = len([e for e in events if e.event_type == 'entertainment'])
    education = len([e for e in events if e.event_type == 'education'])
    points_total = sum(e.points or STUDENT_EVENT_POINTS.get(e.event_type, 0) for e in events)
    by_student = {}
    for student in students:
        by_student[student.id] = {
            'id': student.id,
            'nick': student.nick,
            'name': student.name,
            'tribe': student.tribe,
            'events_total': 0,
            'entertainment_events': 0,
            'education_events': 0,
        }
    for event in events:
        item = by_student.get(event.student_id)
        if not item:
            continue
        item['events_total'] += 1
        item['points'] = item.get('points', 0) + (event.points or STUDENT_EVENT_POINTS.get(event.event_type, 0))
        if event.event_type == 'entertainment':
            item['entertainment_events'] += 1
        if event.event_type == 'education':
            item['education_events'] += 1
    return {
        'tribe': tribe,
        'students_count': len(students),
        'events_total': len(events),
        'entertainment_events': entertainment,
        'education_events': education,
        'points_total': points_total,
        'top_students': sorted(by_student.values(), key=lambda s: (-(s.get('points') or 0), -s['events_total'], s['nick']))[:10],
    }


def _tribe_rankings(pool_id):
    rankings = []
    for tribe in _tribes_for_pool(pool_id):
        metrics = _tribe_metrics(pool_id, tribe)
        rankings.append({
            'tribe': tribe,
            'events_total': metrics['events_total'],
            'entertainment_events': metrics['entertainment_events'],
            'education_events': metrics['education_events'],
            'points_total': metrics['points_total'],
        })
    rankings.sort(key=lambda row: (-row['points_total'], -row['events_total'], row['tribe']))
    for index, row in enumerate(rankings, start=1):
        row['rank'] = index
    return rankings


def _tribe_event_to_dict(event):
    creator = User.query.get(event.created_by) if event.created_by else None
    return {
        'id': event.id,
        'pool_id': event.pool_id,
        'tribe': event.tribe,
        'title': event.title,
        'date': event.event_date.isoformat(),
        'time_start': event.time_start or '',
        'location': event.location or '',
        'comment': event.comment or '',
        'created_by': _user_public_dict(creator) if creator else None,
    }


@app.route('/api/dashboard', methods=['GET'])
@require_auth
def dashboard_summary():
    pool = Pool.query.filter_by(active=True).order_by(Pool.created_at.desc()).first()
    pool_id = pool.id if pool else None
    tomorrow = date.today() + timedelta(days=1)
    counts = _status_counts(pool_id)
    tomorrow_tribe_events = (
        TribeEvent.query.filter_by(pool_id=pool_id, event_date=tomorrow).order_by(TribeEvent.time_start).all()
        if pool_id else []
    )
    data = {
        'pool': pool.to_dict() if pool else None,
        'role': g.user.role,
        'tomorrow': tomorrow.isoformat(),
        'tomorrow_blocks': _tomorrow_blocks(pool_id) if pool_id else [],
        'penalties': counts,
        'tomorrow_tribe_events': [_tribe_event_to_dict(event) for event in tomorrow_tribe_events],
        'my_shifts': _future_my_shifts(g.user.id),
    }
    if g.user.role == 'tribe_master' and pool_id:
        tribe = _resolve_user_tribe(g.user, pool_id)
        rankings = _tribe_rankings(pool_id)
        own_rank = next((row['rank'] for row in rankings if row['tribe'] == tribe), None)
        next_events = (
            TribeEvent.query
            .filter(TribeEvent.pool_id == pool_id, TribeEvent.tribe == tribe, TribeEvent.event_date >= date.today())
            .order_by(TribeEvent.event_date, TribeEvent.time_start)
            .limit(5)
            .all()
        )
        data['tribe'] = {
            **_tribe_metrics(pool_id, tribe),
            'rank': own_rank,
            'rankings': rankings,
            'next_events': [_tribe_event_to_dict(event) for event in next_events],
            'available_tribes': _tribes_for_pool(pool_id),
        }
    return jsonify(data)


@app.route('/api/students', methods=['GET'])
@require_auth
def get_students():
    pool_id = request.args.get('pool_id', type=int) or active_pool_id()
    students = Student.query.filter_by(pool_id=pool_id).all()
    result = []
    for student in students:
        penalties = StudentPenalty.query.filter_by(student_name=student.nick).all()
        all_events = StudentEvent.query.filter_by(student_id=student.id).all()
        events = [e for e in all_events if e.status == 'confirmed']
        total_hours = sum(
            p.hours * p.multiplier
            for p in penalties
            if p.workoff_status not in ('done', 'awaiting_unlock', 'unlocked')
        )
        pending_count = len([p for p in penalties if p.workoff_status == 'pending'])
        overdue_count = len([p for p in penalties if p.workoff_status == 'overdue'])
        entertainment_events = len([e for e in events if e.event_type == 'entertainment'])
        education_events = len([e for e in events if e.event_type == 'education'])
        event_points = sum(e.points or STUDENT_EVENT_POINTS.get(e.event_type, 0) for e in events)
        result.append({
            'id': student.id,
            'nick': student.nick,
            'name': student.name,
            'tribe': student.tribe,
            'violations_count': len(penalties),
            'total_penalty_hours': total_hours,
            'pending_penalties': pending_count,
            'overdue_penalties': overdue_count,
            'awaiting_unlock_penalties': len([p for p in penalties if p.workoff_status == 'awaiting_unlock']),
            'in_workoff': total_hours > 0,
            'events_total': len(events),
            'entertainment_events': entertainment_events,
            'education_events': education_events,
            'event_points': event_points,
            'penalties': [{
                'id': p.id,
                'hours': p.hours * p.multiplier,
                'status': p.workoff_status,
                'volunteer': p.volunteer_name,
                'date': p.date_issued.isoformat(),
            } for p in penalties],
            'events': [{
                'id': e.id,
                'type': e.event_type,
                'date': e.event_date.isoformat() if e.event_date else None,
                'post_url': e.post_url or '',
                'proof_url': e.proof_url or '',
                'points': e.points or STUDENT_EVENT_POINTS.get(e.event_type, 0),
                'status': e.status or 'pending',
                'comment': e.comment or '',
            } for e in events],
        })
    return jsonify(result)


@app.route('/api/students', methods=['POST'])
@require_role('admin', 'team_lead')
def create_student():
    data = request.json or {}
    if not data.get('nick') or not data.get('name'):
        return jsonify({'error': 'Нужны ник и имя'}), 400
    student = Student(
        nick=data['nick'],
        name=data['name'],
        tribe=normalize_tribe(data.get('tribe')) or TRIBES[0],
        pool_id=data.get('pool_id') or active_pool_id(),
    )
    db.session.add(student)
    db.session.commit()
    return jsonify({'id': student.id, 'message': f'Ученик {student.name} добавлен'}), 201


def save_student_rows(rows, pool_id=None):
    pool_id = pool_id or active_pool_id()
    created = 0
    updated = 0
    skipped = []

    for index, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            skipped.append({'row': index, 'reason': 'Некорректная строка'})
            continue

        nick = (row.get('nick') or '').strip()
        name = (row.get('name') or '').strip()
        tribe = normalize_tribe(row.get('tribe')) or TRIBES[0]
        if not nick or not name:
            skipped.append({'row': index, 'reason': 'Нужны nick и name'})
            continue

        student = Student.query.filter(db.func.lower(Student.nick) == nick.lower()).first()
        if student:
            student.name = name
            student.tribe = tribe
            student.pool_id = pool_id
            updated += 1
        else:
            db.session.add(Student(nick=nick, name=name, tribe=tribe, pool_id=pool_id))
            created += 1

    db.session.commit()
    return {
        'created': created,
        'updated': updated,
        'skipped': skipped,
        'message': f'Импортировано: новых {created}, обновлено {updated}, пропущено {len(skipped)}',
    }


@app.route('/api/students/import', methods=['POST'])
@require_role('admin', 'team_lead')
def import_students():
    data = request.json or {}
    rows = data.get('students') or []
    if not isinstance(rows, list) or not rows:
        return jsonify({'error': 'Передайте students: [{nick, name, tribe?}]'}), 400

    pool_id = data.get('pool_id') or active_pool_id()
    return jsonify(save_student_rows(rows, pool_id=pool_id))


@app.route('/api/students/import-file', methods=['POST'])
@require_role('admin', 'team_lead')
def import_students_file():
    uploaded = request.files.get('file')
    if not uploaded:
        return jsonify({'error': 'Загрузите файл'}), 400
    try:
        rows = parse_xlsx_rows(uploaded)
        students = rows_to_dicts(rows, ['nick', 'name', 'tribe'])
    except Exception as e:
        return jsonify({'error': f'Не удалось прочитать .xlsx: {e}'}), 400
    pool_id = request.form.get('pool_id', type=int) or active_pool_id()
    return jsonify(save_student_rows(students, pool_id=pool_id))


@app.route('/api/students/<int:student_id>/events', methods=['POST'])
@require_role('tribe_master', 'admin')
def create_student_event(student_id):
    student = Student.query.get_or_404(student_id)
    data = request.json or {}
    event_type = data.get('event_type')
    if event_type not in ('entertainment', 'education'):
        return jsonify({'error': 'Тип мероприятия должен быть entertainment или education'}), 400
    status = 'confirmed' if g.user.role == 'admin' else 'pending'

    event_date = None
    if data.get('event_date'):
        try:
            event_date = datetime.fromisoformat(data['event_date']).date()
        except ValueError:
            return jsonify({'error': 'Некорректная дата'}), 400

    event = StudentEvent(
        student_id=student.id,
        event_type=event_type,
        event_date=event_date,
        post_url=(data.get('post_url') or '').strip(),
        proof_url=(data.get('proof_url') or '').strip(),
        points=STUDENT_EVENT_POINTS[event_type],
        status=status,
        comment=(data.get('comment') or '').strip(),
        created_by=g.user.id,
    )
    db.session.add(event)
    db.session.commit()
    label = 'развлекательное' if event_type == 'entertainment' else 'обучающее'
    suffix = 'и подтверждено' if status == 'confirmed' else 'и отправлено на проверку'
    return jsonify({'id': event.id, 'message': f'Добавлено {label} мероприятие для @{student.nick} {suffix}'}), 201


@app.route('/api/student-events/<int:event_id>', methods=['PATCH'])
@require_role('admin')
def update_student_event(event_id):
    event = StudentEvent.query.get_or_404(event_id)
    data = request.json or {}
    status = data.get('status')
    if status not in STUDENT_EVENT_STATUSES:
        return jsonify({'error': 'Статус должен быть pending, confirmed или rejected'}), 400
    event.status = status
    event.points = STUDENT_EVENT_POINTS.get(event.event_type, 0) if status == 'confirmed' else 0
    db.session.commit()
    return jsonify({'message': 'Статус мероприятия обновлен'})


@app.route('/api/student-events/<int:event_id>', methods=['DELETE'])
@require_role('tribe_master', 'admin')
def delete_student_event(event_id):
    event = StudentEvent.query.get_or_404(event_id)
    student = Student.query.get(event.student_id)
    if g.user.role == 'tribe_master' and student and g.user.tribe and normalize_tribe(student.tribe) != normalize_tribe(g.user.tribe):
        return jsonify({'error': 'Можно удалять мероприятия только своего трайба'}), 403
    db.session.delete(event)
    db.session.commit()
    return jsonify({'message': 'Мероприятие ученика удалено'})


@app.route('/api/my-tribe', methods=['GET'])
@require_role('tribe_master', 'admin')
def my_tribe():
    pool_id = request.args.get('pool_id', type=int) or active_pool_id()
    tribe = normalize_tribe(request.args.get('tribe')) or _resolve_user_tribe(g.user, pool_id)
    students = Student.query.filter_by(pool_id=pool_id, tribe=tribe).order_by(Student.nick).all()
    rankings = _tribe_rankings(pool_id)
    own_rank = next((row['rank'] for row in rankings if row['tribe'] == tribe), None)
    next_events = (
        TribeEvent.query
        .filter(TribeEvent.pool_id == pool_id, TribeEvent.tribe == tribe, TribeEvent.event_date >= date.today())
        .order_by(TribeEvent.event_date, TribeEvent.time_start)
        .all()
    )
    student_ids = [student.id for student in students]
    event_rows = (
        db.session.query(StudentEvent, Student)
        .join(Student, Student.id == StudentEvent.student_id)
        .filter(StudentEvent.student_id.in_(student_ids))
        .order_by(StudentEvent.event_date.desc(), StudentEvent.created_at.desc())
        .all()
        if student_ids else []
    )
    return jsonify({
        **_tribe_metrics(pool_id, tribe),
        'rank': own_rank,
        'rankings': rankings,
        'available_tribes': _tribes_for_pool(pool_id),
        'students': [{
            'id': student.id,
            'nick': student.nick,
            'name': student.name,
            'tribe': student.tribe,
        } for student in students],
        'student_events': [{
            'id': event.id,
            'student_id': student.id,
            'student_nick': student.nick,
            'student_name': student.name,
            'type': event.event_type,
            'date': event.event_date.isoformat() if event.event_date else None,
            'post_url': event.post_url or '',
            'proof_url': event.proof_url or '',
            'points': event.points or STUDENT_EVENT_POINTS.get(event.event_type, 0),
            'status': event.status or 'pending',
            'comment': event.comment or '',
        } for event, student in event_rows],
        'tribe_events': [_tribe_event_to_dict(event) for event in next_events],
    })


@app.route('/api/tribe-events', methods=['GET'])
@require_auth
def list_tribe_events():
    pool_id = request.args.get('pool_id', type=int) or active_pool_id()
    start = request.args.get('start')
    query = TribeEvent.query.filter_by(pool_id=pool_id)
    if start:
        query = query.filter(TribeEvent.event_date >= datetime.fromisoformat(start).date())
    events = query.order_by(TribeEvent.event_date, TribeEvent.time_start).all()
    return jsonify([_tribe_event_to_dict(event) for event in events])


@app.route('/api/tribe-events', methods=['POST'])
@require_role('tribe_master', 'admin')
def create_tribe_event():
    data = request.json or {}
    pool_id = data.get('pool_id') or active_pool_id()
    tribe = normalize_tribe(data.get('tribe') or g.user.tribe)
    title = (data.get('title') or '').strip()
    if not tribe or not title or not data.get('event_date'):
        return jsonify({'error': 'Нужны tribe, title и event_date'}), 400
    try:
        event_date = datetime.fromisoformat(data['event_date']).date()
    except ValueError:
        return jsonify({'error': 'Некорректная дата'}), 400
    event = TribeEvent(
        pool_id=pool_id,
        tribe=tribe,
        title=title,
        event_date=event_date,
        time_start=(data.get('time_start') or '').strip(),
        location=(data.get('location') or '').strip(),
        comment=(data.get('comment') or '').strip(),
        created_by=g.user.id,
    )
    db.session.add(event)
    db.session.commit()
    return jsonify(_tribe_event_to_dict(event)), 201


@app.route('/api/students/<int:student_id>', methods=['DELETE'])
@require_role('admin', 'team_lead')
def delete_student(student_id):
    student = Student.query.get_or_404(student_id)
    StudentEvent.query.filter_by(student_id=student.id).delete()
    db.session.delete(student)
    db.session.commit()
    return jsonify({'message': 'Ученик удалён'})


# ==================== Штрафы (видят все авторизованные) ====================


@app.route('/api/penalties', methods=['GET'])
@require_auth
def get_penalties():
    pool_id = request.args.get('pool_id', type=int) or active_pool_id()
    penalties = StudentPenalty.query.filter_by(pool_id=pool_id).order_by(StudentPenalty.date_issued.desc()).all()
    penalty_ids = [p.id for p in penalties]
    histories = {}
    if penalty_ids:
        for row in PenaltyHistory.query.filter(PenaltyHistory.penalty_id.in_(penalty_ids)).order_by(PenaltyHistory.created_at).all():
            histories.setdefault(row.penalty_id, []).append({
                'id': row.id,
                'old_status': row.old_status,
                'new_status': row.new_status,
                'old_hours': row.old_hours,
                'new_hours': row.new_hours,
                'actor_nick': row.actor_nick,
                'actor_name': row.actor_name,
                'comment': row.comment or '',
                'created_at': row.created_at.isoformat(),
            })
    return jsonify([{
        'id': p.id,
        'student_name': p.student_name,
        'volunteer_name': p.volunteer_name,
        'hours': p.hours,
        'multiplier': p.multiplier,
        'total_hours': p.hours * p.multiplier,
        'workoff_status': p.workoff_status,
        'description': p.description,
        'date_issued': p.date_issued.isoformat(),
        'date_worked_off': p.date_worked_off.isoformat() if p.date_worked_off else None,
        'history': histories.get(p.id, []),
    } for p in penalties])


@app.route('/api/penalties', methods=['POST'])
@require_auth
def create_penalty():
    data = request.json or {}
    user = g.user
    penalty = StudentPenalty(
        student_name=data['student_name'],
        volunteer_id=user.id,
        volunteer_name=user.name or user.nick,
        hours=2,
        multiplier=1,
        description=data.get('description', ''),
        pool_id=data.get('pool_id') or active_pool_id(),
    )
    db.session.add(penalty)
    db.session.flush()
    add_penalty_history(penalty, None, penalty.workoff_status, None, 'Штраф создан')
    log_action(
        'create',
        'penalty',
        penalty.id,
        f'Штраф для {penalty.student_name}: 2h',
        {
            'student': penalty.student_name,
            'volunteer': penalty.volunteer_name,
            'description': penalty.description,
        },
    )
    enqueue_sync('penalty', 'create', {
        'student': penalty.student_name,
        'volunteer': penalty.volunteer_name,
        'hours': 2,
        'description': penalty.description,
        'at': datetime.utcnow().isoformat(),
    })
    db.session.commit()
    return jsonify({'id': penalty.id, 'message': 'Штраф добавлен'}), 201


@app.route('/api/penalties/<int:penalty_id>', methods=['PATCH'])
@require_auth
def update_penalty_status(penalty_id):
    data = request.json or {}
    penalty = StudentPenalty.query.get_or_404(penalty_id)
    old_status = penalty.workoff_status
    old_hours = penalty.hours * penalty.multiplier
    new_status = data.get('workoff_status', penalty.workoff_status)
    penalty.workoff_status = new_status
    if new_status == 'overdue' and old_status in ('pending', 'overdue'):
        penalty.multiplier *= 2
    if new_status in ('done', 'awaiting_unlock'):
        penalty.date_worked_off = datetime.utcnow()
    if new_status == 'pending':
        penalty.date_worked_off = None
    if old_status != new_status or old_hours != penalty.hours * penalty.multiplier:
        add_penalty_history(penalty, old_status, new_status, old_hours, data.get('comment') or '')
        log_action(
            'update',
            'penalty',
            penalty.id,
            f'Штраф {penalty.student_name}: {old_status} → {new_status}, {old_hours}h → {penalty.hours * penalty.multiplier}h',
            {
                'student': penalty.student_name,
                'old_status': old_status,
                'new_status': new_status,
                'old_hours': old_hours,
                'new_hours': penalty.hours * penalty.multiplier,
            },
        )
    enqueue_sync('penalty', 'update', {
        'id': penalty.id,
        'student': penalty.student_name,
        'status': new_status,
        'total_hours': penalty.hours * penalty.multiplier,
    })
    db.session.commit()
    return jsonify({'message': 'Штраф обновлён'})


@app.route('/api/penalties/<int:penalty_id>', methods=['DELETE'])
@require_auth
def delete_penalty(penalty_id):
    penalty = StudentPenalty.query.get_or_404(penalty_id)
    student_name = penalty.student_name
    log_action(
        'delete',
        'penalty',
        penalty.id,
        f'Удалён штраф для {student_name}',
        {
            'student': student_name,
            'status': penalty.workoff_status,
            'hours': penalty.hours * penalty.multiplier,
        },
    )
    db.session.delete(penalty)
    enqueue_sync('penalty', 'delete', {'id': penalty_id, 'student': student_name})
    db.session.commit()
    return jsonify({'message': f'Штраф для {student_name} отменён'})


# ==================== Админ ====================


def cell_value(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, bool):
        return 'да' if value else ''
    if value is None:
        return ''
    return value


def export_sheet(headers, rows):
    return {
        'headers': headers,
        'rows': [[cell_value(item) for item in row] for row in rows],
    }


STATUS_EXPORT_LABELS = {
    'pending': 'Ожидает отработки',
    'overdue': 'Не пришёл',
    'awaiting_unlock': 'Ждёт разблокировки',
    'unlocked': 'Разблокирован',
    'done': 'Отработано',
}

EVENT_TYPE_EXPORT_LABELS = {
    'entertainment': 'Развлекательное',
    'education': 'Образовательное',
}
ROLE_EXPORT_LABELS = {
    'volunteer': 'Волонтёр',
    'tribe_master': 'Трайб-мастер',
    'team_lead': 'Тимлид',
    'admin': 'Админ',
}


def _export_event_type_label(event_type):
    return EVENT_TYPE_EXPORT_LABELS.get(event_type, event_type or '')


def build_export_sheets():
    users = {u.id: u for u in User.query.all()}
    blocks = {b.id: b for b in ShiftBlock.query.all()}
    pools = {p.id: p for p in Pool.query.all()}
    students = {s.id: s for s in Student.query.all()}

    sheets = {}
    active_pool = Pool.query.filter_by(active=True).order_by(Pool.created_at.desc()).first()
    start_date = active_pool.start_date if active_pool and active_pool.start_date else None
    all_blocks = ShiftBlock.query.order_by(ShiftBlock.date, ShiftBlock.time_start).all()
    if not start_date and all_blocks:
        start_date = min(block.date for block in all_blocks)

    shift_rows = []
    if start_date:
        shift_rows.append(['СТАРТ БАССЕЙНА:', '', '', '', '', '', start_date, '', '', 'Подсмотреть заработанные коины:', '', ''])
        signups_by_block = {}
        for signup in Signup.query.order_by(Signup.created_at).all():
            signups_by_block.setdefault(signup.block_id, []).append(users.get(signup.user_id))
        blocks_by_date = {}
        for block in all_blocks:
            blocks_by_date.setdefault(block.date, []).append(block)
        current = start_date
        end_date = max((block.date for block in all_blocks), default=start_date)
        while current <= end_date:
            week = [current + timedelta(days=i) for i in range(7)]
            shift_rows.append(week + ['', '', 'никнейм', 'коины'])
            day_lines = []
            max_lines = 1
            for day in week:
                lines = []
                for block in sorted(blocks_by_date.get(day, []), key=lambda item: item.time_start):
                    label = f'{block.time_start} - {block.time_end}{(" " + block.label) if block.label else ""}'
                    lines.append(label)
                    for user in signups_by_block.get(block.id, []):
                        if user:
                            lines.append(user.nick)
                day_lines.append(lines)
                max_lines = max(max_lines, len(lines))
            for index in range(max_lines):
                row = [(lines[index] if index < len(lines) else '') for lines in day_lines]
                shift_rows.append(row + ['', '', '', ''])
            shift_rows.append([''] * 11)
            current += timedelta(days=7)
        shift_rows.append(['Created by app export'])
        coin_totals = []
        for user in User.query.filter(User.role.in_(list(VOLUNTEER_PROFILE_ROLES))).order_by(User.nick).all():
            rewards = calculate_user_rewards(user, user.coins_adjustment or 0)
            coin_totals.append([user.nick, rewards['total']])
        for index, item in enumerate(coin_totals, start=2):
            while len(shift_rows) <= index:
                shift_rows.append([''] * 11)
            while len(shift_rows[index]) < 11:
                shift_rows[index].append('')
            shift_rows[index][9] = item[0]
            shift_rows[index][10] = item[1]
    sheets['shifts'] = {'headers': [], 'rows': [[cell_value(item) for item in row] for row in shift_rows]}

    sheets['site_signups'] = export_sheet(
        ['Когда', 'Действие', 'Дата', 'Время', 'Метка', 'Ник'],
        [[s.created_at, 'create', blocks.get(s.block_id).date if blocks.get(s.block_id) else '',
          f'{blocks.get(s.block_id).time_start} - {blocks.get(s.block_id).time_end}' if blocks.get(s.block_id) else '',
          blocks.get(s.block_id).label if blocks.get(s.block_id) else '', users.get(s.user_id).nick if users.get(s.user_id) else '']
         for s in Signup.query.order_by(Signup.created_at).all()],
    )

    sheets['penalty'] = export_sheet(
        ['Ник нарушителя', 'Дата и время назначения пенальти', 'Причина пенальти', 'Кто зафиксировал пенальти (ник волонтера)',
         'Статус penalty (для отслеживания)', 'Кто занес', 'Дата выдачи пенальти', 'Часы', 'Ждёт разблокировки'],
        [[p.student_name, p.date_issued, p.description, p.volunteer_name,
          STATUS_EXPORT_LABELS.get(p.workoff_status, p.workoff_status), p.volunteer_name, p.date_issued,
          p.hours * p.multiplier, 'да' if p.workoff_status == 'awaiting_unlock' else '']
         for p in StudentPenalty.query.order_by(StudentPenalty.date_issued).all()],
    )
    sheets['tribe_event'] = export_sheet(
        ['Ник участника', 'Трайб', 'Дата проведения', 'Тип мероприятия', 'Краткое описание',
         'Ник трайб-мастера', 'Дата заполнения', 'Баллы', 'Статус', 'Ссылка на пост'],
        [[students.get(e.student_id).nick if students.get(e.student_id) else '', students.get(e.student_id).tribe if students.get(e.student_id) else '',
          e.event_date, _export_event_type_label(e.event_type), e.comment, users.get(e.created_by).nick if users.get(e.created_by) else '',
          e.created_at, e.points or STUDENT_EVENT_POINTS.get(e.event_type, 0), e.status or '', e.post_url]
         for e in StudentEvent.query.order_by(StudentEvent.event_date, StudentEvent.created_at).all()],
    )

    reward_rows = []
    for user in User.query.filter(User.role.in_(list(VOLUNTEER_PROFILE_ROLES))).order_by(User.nick).all():
        rewards = calculate_user_rewards(user, user.coins_adjustment or 0)
        by_type = {item['type']: item for item in rewards['breakdown']}
        first_day = by_type.get('first_day_hour', {'count': 0, 'coins': 0})
        first_week = by_type.get('first_week_or_weekend_hour', {'count': 0, 'coins': 0})
        weekdays = by_type.get('subsequent_weekday_hour', {'count': 0, 'coins': 0})
        exams = by_type.get('exam_hour', {'count': 0, 'coins': 0})
        group_review = by_type.get('group_review', {'count': 0, 'coins': 0})
        tribe_master = by_type.get('tribe_master_event', {'count': 0, 'coins': 0})
        confession = by_type.get('confession', {'count': 0, 'coins': 0})
        manual = by_type.get('manual', {'count': 0, 'coins': 0})
        reward_rows.append([
            user.nick,
            first_day.get('count', 0),
            first_week.get('count', 0),
            weekdays.get('count', 0),
            exams.get('count', 0),
            group_review.get('count', 0),
            tribe_master.get('count', 0),
            confession.get('count', 0),
            '',
            first_day.get('coins', 0),
            first_week.get('coins', 0),
            weekdays.get('coins', 0),
            exams.get('coins', 0),
            group_review.get('coins', 0),
            tribe_master.get('coins', 0),
            confession.get('coins', 0),
            manual.get('coins', 0),
            rewards['total'],
        ])
    sheets['reward_calc'] = export_sheet(
        ['Никнейм', 'Первый день', 'Первая неделя и выходные', 'Будние дни', 'Экзамены',
         'Групповые', 'Трайб-ивенты', 'Исповедь', 'ИТОГ', 'Первый день', 'Первая неделя и выходные',
         'Будние дни', 'Экзамены', 'Групповые', 'Трайб-ивенты', 'Исповедь', 'Допы', 'ИТОГО'],
        reward_rows,
    )

    group_reviewers = db.session.query(User).join(GroupReview, GroupReview.reviewer_id == User.id).distinct().order_by(User.nick).all()
    volunteer_rows = []
    volunteer_list = User.query.filter(User.role.in_(list(VOLUNTEER_PROFILE_ROLES))).order_by(User.nick).all()
    tribe_masters = User.query.filter_by(role='tribe_master').order_by(User.tribe, User.nick).all()
    max_volunteer_rows = max(len(volunteer_list), len(tribe_masters), len(group_reviewers), 1)
    for index in range(max_volunteer_rows):
        person = volunteer_list[index] if index < len(volunteer_list) else None
        master = tribe_masters[index] if index < len(tribe_masters) else None
        reviewer = group_reviewers[index] if index < len(group_reviewers) else None
        volunteer_rows.append([
            person.name or person.nick if person else '',
            person.nick if person else '',
            f'{master.tribe} ->' if master and master.tribe else '',
            master.nick if master else '',
            '',
            reviewer.nick if reviewer else '',
            '',
            person.nick if person else '',
            person.name or person.nick if person else '',
        ])
    sheets['volunteers'] = export_sheet(
        ['ФИО', 'Никнейм', '', 'Трайб мастера', '', 'Проверка групповых', '', '', ''],
        volunteer_rows,
    )

    review_grid_rows = []
    reviews_by_date = {}
    for review in GroupReview.query.order_by(GroupReview.review_date, GroupReview.time_start).all():
        reviews_by_date.setdefault(review.review_date, []).append(review)
    for review_date, reviews in reviews_by_date.items():
        row = [review_date, 'проверки']
        for review in reviews:
            reviewer = users.get(review.reviewer_id)
            row.extend([reviewer.nick if reviewer else ''] * max(1, review.quantity or 1))
        review_grid_rows.append(row)
    sheets['group_review'] = export_sheet(
        ['проверка групповых'],
        review_grid_rows,
    )

    confession_rows = [['дата проведения', start_date + timedelta(days=4) if start_date else '']]
    for index, user in enumerate(User.query.filter_by(has_confession=True).order_by(User.nick).all(), start=1):
        confession_rows.append([index, user.nick])
    sheets['confession'] = export_sheet(
        ['Иcповедь волонтёра'],
        confession_rows,
    )

    sheets['tribe_events'] = export_sheet(
        ['Дата', 'Время', 'Трайб', 'Название', 'Место', 'Комментарий', 'Кто занёс'],
        [[e.event_date, e.time_start, e.tribe, e.title, e.location, e.comment, users.get(e.created_by).nick if users.get(e.created_by) else '']
         for e in TribeEvent.query.order_by(TribeEvent.event_date, TribeEvent.time_start).all()],
    )

    sheets['reward'] = export_sheet(
        ['Type', 'Coins'],
        [
            ['Дежурство в первую неделю интенсива и в выходные дни (за 1 час)', REWARD_RATES['first_week_or_weekend_hour']],
            ['Дежурство в последующие недели интенсива | Будние дни (за 1 час)', REWARD_RATES['subsequent_weekday_hour']],
            ['Проверка групповых (1 проверка)', REWARD_RATES['group_review']],
            ['Участие в проведении экзамена (за 1 час)', REWARD_RATES['exam_hour']],
            ['Трайб мастер на отборочном интенсиве (1 мероприятие)', REWARD_RATES['tribe_master_event']],
            ['Тим лидер команды волонтеров', REWARD_RATES['team_lead']],
            ['Волонтерство в первый день отборочного интенсива (1 час)', REWARD_RATES['first_day_hour']],
            ['Участие в исповеди', REWARD_RATES['confession']],
        ],
    )

    sheets['penalty_history'] = export_sheet(
        ['ID штрафа', 'Было', 'Стало', 'Было часов', 'Стало часов', 'Кто изменил', 'Комментарий', 'Когда'],
        [[h.penalty_id, STATUS_EXPORT_LABELS.get(h.old_status, h.old_status), STATUS_EXPORT_LABELS.get(h.new_status, h.new_status),
          h.old_hours, h.new_hours, h.actor_nick, h.comment, h.created_at]
         for h in PenaltyHistory.query.order_by(PenaltyHistory.created_at).all()],
    )
    sheets['action_log'] = export_sheet(
        ['Когда', 'Кто', 'Действие', 'Сущность', 'Описание'],
        [[a.created_at, a.actor_nick, a.action, a.entity, a.description]
         for a in ActionLog.query.order_by(ActionLog.created_at).all()],
    )
    return sheets


def build_export_workbook():
    from openpyxl import Workbook, load_workbook
    from openpyxl.styles import Font, PatternFill, Alignment

    sheets = build_export_sheets()
    template = load_google_sheet_template()
    if template:
        return build_template_export_workbook(template, sheets)

    wb = Workbook()
    wb.remove(wb.active)
    header_fill = PatternFill('solid', fgColor='1F1F1F')
    header_font = Font(bold=True, color='00FF00')
    for name, data in sheets.items():
        ws = wb.create_sheet(title=name[:31])
        if data['headers']:
            ws.append(data['headers'])
        for row in data['rows']:
            ws.append(row)
        if ws.max_row:
            for cell in ws[1]:
                cell.fill = header_fill
                cell.font = header_font
                cell.alignment = Alignment(horizontal='center')
        ws.freeze_panes = 'A2' if data['headers'] else None
        for column in ws.columns:
            letter = column[0].column_letter
            width = min(36, max(10, max(len(str(cell.value or '')) for cell in column[:200]) + 2))
            ws.column_dimensions[letter].width = width
    return wb


def load_google_sheet_template():
    sheet_id = os.getenv('GOOGLE_SHEETS_ID', '')
    if not sheet_id:
        return None
    url = f'https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=xlsx'
    try:
        import requests
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        from openpyxl import load_workbook
        return load_workbook(BytesIO(response.content))
    except Exception as e:
        print('[export] template download failed:', e)
        return None


def write_matrix(ws, values, start_row=1, start_col=1, preserve_first_row=False):
    if not values:
        return
    first_row = start_row + (1 if preserve_first_row else 0)
    max_rows = max(0, ws.max_row - first_row + 1)
    max_cols = max(ws.max_column or 0, max((len(row) for row in values), default=0))
    if max_rows and max_cols:
        for row in ws.iter_rows(min_row=first_row, max_row=ws.max_row, min_col=start_col, max_col=max_cols):
            for cell in row:
                cell.value = None
    for r_index, row in enumerate(values, start=start_row):
        if preserve_first_row and r_index == start_row:
            continue
        for c_index, value in enumerate(row, start=start_col):
            ws.cell(r_index, c_index).value = value


def export_values_for_sheet(name, data):
    return [data['headers'], *data['rows']] if data['headers'] else data['rows']


def build_template_export_workbook(wb, sheets):
    source_names = list(sheets.keys())
    for name in list(wb.sheetnames):
        if name.startswith('export_'):
            del wb[name]
    for name in source_names:
        if name in wb.sheetnames:
            ws = wb.copy_worksheet(wb[name])
            ws.title = f'export_{name}'[:31]
        else:
            ws = wb.create_sheet(title=f'export_{name}'[:31])
        values = export_values_for_sheet(name, sheets[name])
        preserve_first_row = name not in ('shifts', 'tribe_events')
        write_matrix(ws, values, preserve_first_row=preserve_first_row)
    meta = wb.create_sheet(title='export_meta') if 'export_meta' not in wb.sheetnames else wb['export_meta']
    write_matrix(meta, [
        ['key', 'value'],
        ['exported_at', datetime.utcnow().isoformat()],
        ['sheets', ', '.join([f'export_{name}' for name in source_names])],
    ])
    return wb


def save_export_workbook(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    workbook = build_export_workbook()
    workbook.save(path)
    return path


def latest_backup_file():
    if not os.path.isdir(BACKUP_DIR):
        return None
    files = [
        os.path.join(BACKUP_DIR, name)
        for name in os.listdir(BACKUP_DIR)
        if name.endswith('.xlsx')
    ]
    return max(files, key=os.path.getmtime) if files else None


def backup_filename_for_today():
    return os.path.join(BACKUP_DIR, f'pool-backup-{date.today().isoformat()}.xlsx')


def create_daily_backup(force=False):
    if not _backup_lock.acquire(blocking=False):
        return None
    try:
        path = backup_filename_for_today()
        if not force and os.path.exists(path):
            return path
        with app.app_context():
            save_export_workbook(path)
        print(f'[backup] сохранён резерв: {path}')
        return path
    finally:
        _backup_lock.release()


def backup_worker_loop():
    while True:
        try:
            create_daily_backup(force=False)
        except Exception as e:
            print('[backup] error:', e)
        time.sleep(BACKUP_INTERVAL)


def start_backup_worker():
    t = threading.Thread(target=backup_worker_loop, daemon=True)
    t.start()
    print(f'[backup] воркер запущен, папка={BACKUP_DIR}')


def start_runtime_services():
    global _runtime_started
    if _runtime_started:
        return
    _runtime_started = True
    start_sync_worker()
    start_backup_worker()


@app.route('/api/admin/export.xlsx', methods=['GET'])
@require_role('team_lead', 'admin')
def export_xlsx():
    output = BytesIO()
    workbook = build_export_workbook()
    workbook.save(output)
    output.seek(0)
    filename = f'pool-export-{datetime.utcnow().strftime("%Y-%m-%d-%H%M")}.xlsx'
    log_action('export', 'workbook', None, 'Скачан Excel-экспорт', {'filename': filename})
    db.session.commit()
    return send_file(
        output,
        as_attachment=True,
        download_name=filename,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )


@app.route('/api/admin/export/google-sheets', methods=['POST'])
@require_role('team_lead', 'admin')
def export_google_sheets():
    if not SYNC_WEBHOOK_URL:
        return jsonify({'error': 'SYNC_WEBHOOK_URL не настроен'}), 400
    sheets = build_export_sheets()
    body = {
        'secret': SYNC_SECRET,
        'mode': 'full_export',
        'exported_at': datetime.utcnow().isoformat(),
        'sheets': {
            name: [data['headers'], *data['rows']]
            for name, data in sheets.items()
        },
    }
    try:
        import requests
        resp = requests.post(SYNC_WEBHOOK_URL, json=body, timeout=60)
        data = resp.json() if resp.content else {}
    except Exception as e:
        return jsonify({'error': f'Не удалось отправить в Google Sheets: {e}'}), 502
    if resp.status_code != 200 or not data.get('ok'):
        return jsonify({'error': data.get('error') or f'HTTP {resp.status_code}'}), 502
    if not data.get('sheets'):
        return jsonify({'error': 'Apps Script нужно обновить до версии с full_export'}), 502
    log_action('export', 'google_sheets', None, 'Полный экспорт отправлен в Google Sheets', {'sheets': list(sheets.keys())})
    db.session.commit()
    return jsonify({'message': 'Экспорт отправлен в Google Sheets', 'sheets': data.get('sheets') or list(sheets.keys())})


@app.route('/api/admin/backup-status', methods=['GET'])
@require_role('team_lead', 'admin')
def backup_status():
    latest = latest_backup_file()
    return jsonify({
        'backup_dir': BACKUP_DIR,
        'latest_file': latest,
        'latest_at': datetime.fromtimestamp(os.path.getmtime(latest)).isoformat() if latest else None,
        'today_exists': os.path.exists(backup_filename_for_today()),
    })


@app.route('/api/admin/backup-now', methods=['POST'])
@require_role('team_lead', 'admin')
def backup_now():
    path = create_daily_backup(force=True)
    log_action('backup', 'workbook', None, 'Создан ручной резерв Excel', {'path': path})
    db.session.commit()
    return jsonify({'message': 'Резерв создан', 'path': path})


@app.route('/api/admin/sync-status', methods=['GET'])
@require_role('team_lead', 'admin')
def sync_status():
    pending = SyncOutbox.query.filter_by(status='pending').count()
    errors = SyncOutbox.query.filter_by(status='error').count()
    sent = SyncOutbox.query.filter_by(status='sent').count()
    last = SyncOutbox.query.filter_by(status='sent').order_by(SyncOutbox.sent_at.desc()).first()
    return jsonify({
        'pending': pending,
        'errors': errors,
        'sent': sent,
        'configured': bool(SYNC_WEBHOOK_URL),
        'last_sent_at': last.sent_at.isoformat() if last and last.sent_at else None,
    })


@app.route('/api/admin/action-log', methods=['GET'])
@require_role('team_lead', 'admin')
def action_log():
    limit = min(request.args.get('limit', default=80, type=int) or 80, 200)
    rows = ActionLog.query.order_by(ActionLog.created_at.desc(), ActionLog.id.desc()).limit(limit).all()
    return jsonify([{
        'id': row.id,
        'actor_nick': row.actor_nick,
        'actor_name': row.actor_name,
        'action': row.action,
        'entity': row.entity,
        'entity_id': row.entity_id,
        'description': row.description or '',
        'payload': json.loads(row.payload or '{}'),
        'created_at': row.created_at.isoformat(),
    } for row in rows])


@app.route('/api/admin/sync-now', methods=['POST'])
@require_role('team_lead', 'admin')
def sync_now():
    result = process_outbox_once()
    return jsonify(result)


@app.route('/api/admin/reset', methods=['POST'])
@require_role('admin')
def reset_database():
    data = request.json or {}
    if data.get('confirm') != 'RESET':
        return jsonify({'error': 'Нужно подтверждение confirm=RESET'}), 400
    db.drop_all()
    db.create_all()
    seed_admin()
    return jsonify({'message': 'База сброшена'})


# ==================== Инициализация ====================


def seed_admin():
    """Создать стартового админа, если его нет."""
    admin_nick = os.getenv('ADMIN_NICK', 'admin')
    admin_pass = os.getenv('ADMIN_PASSWORD', 'admin123')
    if not User.query.filter(db.func.lower(User.nick) == admin_nick.lower()).first():
        admin = User(
            nick=admin_nick,
            name='Администратор',
            role='admin',
            password_hash=generate_password_hash(admin_pass),
        )
        db.session.add(admin)
        db.session.commit()
        print(f'[seed] admin создан: ник="{admin_nick}" пароль="{admin_pass}"')


def ensure_user_profile_columns():
    """Лёгкая SQLite-миграция для новых полей профиля волонтёра."""
    if db.engine.dialect.name != 'sqlite':
        return
    with db.engine.connect() as conn:
        tables = {row[0] for row in conn.exec_driver_sql(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()}
        columns = {row[1] for row in conn.exec_driver_sql('PRAGMA table_info(users)').fetchall()}
        if 'is_group_reviewer' not in columns:
            conn.exec_driver_sql('ALTER TABLE users ADD COLUMN is_group_reviewer BOOLEAN DEFAULT 0')
        if 'has_confession' not in columns:
            conn.exec_driver_sql('ALTER TABLE users ADD COLUMN has_confession BOOLEAN DEFAULT 0')
        if 'coins_adjustment' not in columns:
            conn.exec_driver_sql('ALTER TABLE users ADD COLUMN coins_adjustment INTEGER DEFAULT 0')
        if 'tribe' not in columns:
            conn.exec_driver_sql('ALTER TABLE users ADD COLUMN tribe VARCHAR(50)')
        shift_columns = set()
        if 'shift_blocks' in tables:
            shift_columns = {
                row[1] for row in conn.exec_driver_sql('PRAGMA table_info(shift_blocks)').fetchall()
            }
            if 'generation_id' not in shift_columns:
                conn.exec_driver_sql('ALTER TABLE shift_blocks ADD COLUMN generation_id INTEGER')
        student_event_columns = set()
        if 'student_events' in tables:
            student_event_columns = {
                row[1] for row in conn.exec_driver_sql('PRAGMA table_info(student_events)').fetchall()
            }
        if 'reward_events' not in tables:
            conn.exec_driver_sql("""
                CREATE TABLE reward_events (
                    id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    event_type VARCHAR(50) NOT NULL,
                    event_date DATE,
                    quantity INTEGER DEFAULT 1,
                    coins INTEGER NOT NULL,
                    comment TEXT,
                    created_by INTEGER,
                    created_at DATETIME,
                    PRIMARY KEY (id),
                    FOREIGN KEY(user_id) REFERENCES users (id),
                    FOREIGN KEY(created_by) REFERENCES users (id)
                )
            """)
        if 'student_events' not in tables:
            conn.exec_driver_sql("""
                CREATE TABLE student_events (
                    id INTEGER NOT NULL,
                    student_id INTEGER NOT NULL,
                    event_type VARCHAR(30) NOT NULL,
                    event_date DATE,
                    post_url VARCHAR(500),
                    proof_url VARCHAR(500),
                    points INTEGER DEFAULT 0,
                    status VARCHAR(20) DEFAULT 'pending',
                    comment TEXT,
                    created_by INTEGER,
                    created_at DATETIME,
                    PRIMARY KEY (id),
                    FOREIGN KEY(student_id) REFERENCES students (id),
                    FOREIGN KEY(created_by) REFERENCES users (id)
                )
            """)
        else:
            if 'post_url' not in student_event_columns:
                conn.exec_driver_sql('ALTER TABLE student_events ADD COLUMN post_url VARCHAR(500)')
            if 'proof_url' not in student_event_columns:
                conn.exec_driver_sql('ALTER TABLE student_events ADD COLUMN proof_url VARCHAR(500)')
            if 'points' not in student_event_columns:
                conn.exec_driver_sql('ALTER TABLE student_events ADD COLUMN points INTEGER DEFAULT 0')
            if 'status' not in student_event_columns:
                conn.exec_driver_sql("ALTER TABLE student_events ADD COLUMN status VARCHAR(20) DEFAULT 'confirmed'")
            conn.exec_driver_sql("UPDATE student_events SET status = 'confirmed' WHERE status IS NULL OR status = ''")
            conn.exec_driver_sql("UPDATE student_events SET points = 2 WHERE event_type = 'entertainment' AND (points IS NULL OR points = 0)")
            conn.exec_driver_sql("UPDATE student_events SET points = 4 WHERE event_type = 'education' AND (points IS NULL OR points = 0)")
        if 'tribe_events' not in tables:
            conn.exec_driver_sql("""
                CREATE TABLE tribe_events (
                    id INTEGER NOT NULL,
                    pool_id INTEGER,
                    tribe VARCHAR(50) NOT NULL,
                    title VARCHAR(200) NOT NULL,
                    event_date DATE NOT NULL,
                    time_start VARCHAR(5),
                    location VARCHAR(200),
                    comment TEXT,
                    created_by INTEGER,
                    created_at DATETIME,
                    PRIMARY KEY (id),
                    FOREIGN KEY(created_by) REFERENCES users (id)
                )
            """)
        if 'schedule_generations' not in tables:
            conn.exec_driver_sql("""
                CREATE TABLE schedule_generations (
                    id INTEGER NOT NULL,
                    pool_id INTEGER NOT NULL,
                    end_date DATE,
                    created_by INTEGER,
                    created_at DATETIME,
                    PRIMARY KEY (id),
                    FOREIGN KEY(pool_id) REFERENCES pools (id),
                    FOREIGN KEY(created_by) REFERENCES users (id)
                )
            """)
        if 'group_reviews' not in tables:
            conn.exec_driver_sql("""
                CREATE TABLE group_reviews (
                    id INTEGER NOT NULL,
                    pool_id INTEGER,
                    review_date DATE NOT NULL,
                    time_start VARCHAR(5) NOT NULL,
                    flow VARCHAR(50) NOT NULL,
                    quantity INTEGER DEFAULT 1,
                    reviewer_id INTEGER NOT NULL,
                    created_by INTEGER,
                    created_at DATETIME,
                    PRIMARY KEY (id),
                    FOREIGN KEY(reviewer_id) REFERENCES users (id),
                    FOREIGN KEY(created_by) REFERENCES users (id)
                )
            """)
        else:
            group_review_columns = {
                row[1] for row in conn.exec_driver_sql('PRAGMA table_info(group_reviews)').fetchall()
            }
            if 'quantity' not in group_review_columns:
                conn.exec_driver_sql('ALTER TABLE group_reviews ADD COLUMN quantity INTEGER DEFAULT 1')
            conn.exec_driver_sql('UPDATE group_reviews SET quantity = 1 WHERE quantity IS NULL OR quantity < 1')
        if 'penalty_history' not in tables:
            conn.exec_driver_sql("""
                CREATE TABLE penalty_history (
                    id INTEGER NOT NULL,
                    penalty_id INTEGER NOT NULL,
                    old_status VARCHAR(20),
                    new_status VARCHAR(20) NOT NULL,
                    old_hours INTEGER,
                    new_hours INTEGER,
                    actor_id INTEGER,
                    actor_nick VARCHAR(100),
                    actor_name VARCHAR(100),
                    comment TEXT,
                    created_at DATETIME,
                    PRIMARY KEY (id),
                    FOREIGN KEY(actor_id) REFERENCES users (id)
                )
            """)
        if 'action_logs' not in tables:
            conn.exec_driver_sql("""
                CREATE TABLE action_logs (
                    id INTEGER NOT NULL,
                    actor_id INTEGER,
                    actor_nick VARCHAR(100),
                    actor_name VARCHAR(100),
                    action VARCHAR(80) NOT NULL,
                    entity VARCHAR(50) NOT NULL,
                    entity_id INTEGER,
                    description TEXT,
                    payload TEXT,
                    created_at DATETIME,
                    PRIMARY KEY (id),
                    FOREIGN KEY(actor_id) REFERENCES users (id)
                )
            """)
        for table in ('users', 'students', 'tribe_events'):
            if table in tables:
                conn.exec_driver_sql(f"UPDATE {table} SET tribe = 'Ленты' WHERE lower(tribe) IN ('a', '1')")
                conn.exec_driver_sql(f"UPDATE {table} SET tribe = 'Короны' WHERE lower(tribe) IN ('b', '2')")
                conn.exec_driver_sql(f"UPDATE {table} SET tribe = 'Олени' WHERE lower(tribe) IN ('c', '3')")
        conn.commit()


with app.app_context():
    db.create_all()
    ensure_user_profile_columns()
    seed_admin()


if __name__ != '__main__' and os.getenv('AUTO_START_WORKERS', 'false').lower() == 'true':
    start_runtime_services()


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5001))
    debug = os.getenv('FLASK_DEBUG', 'true').lower() == 'true'
    # запускаем воркер один раз: в debug-режиме код стартует дважды (reloader),
    # поэтому стартуем только в дочернем процессе reloader или когда debug выключен
    if not debug or os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
        start_runtime_services()
    app.run(host='0.0.0.0', port=port, debug=debug)
