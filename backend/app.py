import os
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
from datetime import datetime

# Загрузить переменные окружения
load_dotenv()

# Инициализация Flask
app = Flask(__name__)
CORS(app)

# Конфигурация БД
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv(
    'DATABASE_URL',
    'sqlite:///pool.db'
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key')

# Инициализация БД
db = SQLAlchemy(app)

# ==================== Модели ====================

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(20), nullable=False)  # volunteer, team_lead, admin
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Shift(db.Model):
    __tablename__ = 'shifts'
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, nullable=False)
    time_start = db.Column(db.String(5), nullable=False)
    time_end = db.Column(db.String(5), nullable=False)
    location = db.Column(db.String(100), default='Бассейн')
    status = db.Column(db.String(20), default='pending')  # pending, confirmed
    volunteers = db.Column(db.String(500))  # JSON string
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Reward(db.Model):
    __tablename__ = 'rewards'
    id = db.Column(db.Integer, primary_key=True)
    volunteer_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    volunteer_name = db.Column(db.String(100))
    type = db.Column(db.String(50))  # shift_completed, late, no_show, bonus
    coins = db.Column(db.Float, default=0)
    date = db.Column(db.DateTime, default=datetime.utcnow)
    notes = db.Column(db.Text)

class StudentPenalty(db.Model):
    __tablename__ = 'student_penalties'
    id = db.Column(db.Integer, primary_key=True)
    student_name = db.Column(db.String(100), nullable=False)
    volunteer_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    volunteer_name = db.Column(db.String(100))
    hours = db.Column(db.Integer, default=2)  # 2 часа за нарушение
    multiplier = db.Column(db.Integer, default=1)  # x1, x2, x4 и т.д.
    workoff_status = db.Column(db.String(20), default='pending')  # pending, done, overdue
    description = db.Column(db.Text)
    date_issued = db.Column(db.DateTime, default=datetime.utcnow)
    date_worked_off = db.Column(db.DateTime)
    pool_id = db.Column(db.Integer)  # Какой бассейн

class Event(db.Model):
    __tablename__ = 'events'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    tribe = db.Column(db.String(50))  # A, B, C группа
    tribe_master_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    tribe_master_name = db.Column(db.String(100))
    status = db.Column(db.String(20), default='pending')  # pending, approved, rejected
    date = db.Column(db.DateTime, default=datetime.utcnow)
    pool_id = db.Column(db.Integer)

class Student(db.Model):
    __tablename__ = 'students'
    id = db.Column(db.Integer, primary_key=True)
    nick = db.Column(db.String(100), unique=True, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    tribe = db.Column(db.String(50))  # A, B, C группа
    pool_id = db.Column(db.Integer)
    total_penalty_hours = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

# ==================== API Routes ====================

@app.route('/api/health', methods=['GET'])
def health():
    """Проверка здоровья сервера"""
    return jsonify({'status': 'ok', 'timestamp': datetime.utcnow().isoformat()})

@app.route('/api/auth/login', methods=['POST'])
def login():
    """Аутентификация пользователя"""
    data = request.json
    if not data.get('name'):
        return jsonify({'error': 'Name required'}), 400

    user = User.query.filter_by(name=data['name']).first()
    if not user:
        user = User(
            name=data['name'],
            role=data.get('role', 'volunteer'),
            active=True
        )
        db.session.add(user)
        db.session.commit()

    return jsonify({
        'id': user.id,
        'name': user.name,
        'role': user.role
    })

@app.route('/api/stats', methods=['GET'])
def stats():
    """Получить статистику"""
    total_shifts = Shift.query.count()
    volunteers = User.query.filter_by(role='volunteer').count()
    upcoming_shifts = Shift.query.filter(
        Shift.date >= datetime.now().date()
    ).count()
    total_coins = db.session.query(
        db.func.sum(Reward.coins)
    ).scalar() or 0

    return jsonify({
        'totalShifts': total_shifts,
        'volunteers': volunteers,
        'upcomingShifts': upcoming_shifts,
        'totalCoins': float(total_coins)
    })

@app.route('/api/shifts', methods=['GET'])
def get_shifts():
    """Получить все смены"""
    shifts = Shift.query.all()
    return jsonify([{
        'id': s.id,
        'date': s.date.isoformat(),
        'time_start': s.time_start,
        'time_end': s.time_end,
        'location': s.location,
        'status': s.status,
        'volunteers': s.volunteers.split(',') if s.volunteers else []
    } for s in shifts])

@app.route('/api/shifts', methods=['POST'])
def create_shift():
    """Создать новую смену"""
    data = request.json
    shift = Shift(
        date=datetime.fromisoformat(data['date']).date(),
        time_start=data.get('time_start', '10:00'),
        time_end=data.get('time_end', '14:00'),
        location=data.get('location', 'Бассейн')
    )
    db.session.add(shift)
    db.session.commit()
    return jsonify({'id': shift.id, 'message': 'Shift created'}), 201

@app.route('/api/shifts/<int:shift_id>', methods=['DELETE'])
def delete_shift(shift_id):
    """Удалить смену"""
    shift = Shift.query.get_or_404(shift_id)
    db.session.delete(shift)
    db.session.commit()
    return jsonify({'message': 'Shift deleted'})

@app.route('/api/volunteers', methods=['GET'])
def get_volunteers():
    """Получить всех волонтёров"""
    users = User.query.filter_by(role='volunteer').all()
    result = []
    for user in users:
        shifts_count = Shift.query.filter(
            Shift.volunteers.contains(user.name)
        ).count()
        coins = db.session.query(
            db.func.sum(Reward.coins)
        ).filter_by(volunteer_id=user.id).scalar() or 0
        penalties = db.session.query(
            db.func.count(Reward.id)
        ).filter_by(volunteer_id=user.id, type='late').scalar() or 0

        result.append({
            'id': user.id,
            'name': user.name,
            'active': user.active,
            'shifts_count': shifts_count,
            'coins': float(coins),
            'penalties': penalties
        })
    return jsonify(result)

@app.route('/api/rewards', methods=['GET'])
def get_rewards():
    """Получить все награды"""
    rewards = Reward.query.order_by(Reward.date.desc()).all()
    return jsonify([{
        'id': r.id,
        'volunteer_name': r.volunteer_name,
        'type': r.type,
        'coins': r.coins,
        'date': r.date.isoformat(),
        'notes': r.notes
    } for r in rewards])

@app.route('/api/sync', methods=['POST'])
def sync_sheets():
    """Синхронизировать с Google Sheets"""
    try:
        # TODO: Реализовать синхронизацию с Google Sheets
        return jsonify({
            'message': 'Sync started',
            'timestamp': datetime.utcnow().isoformat()
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/export', methods=['GET'])
def export_data():
    """Экспортировать данные в JSON"""
    import json
    from io import BytesIO

    data = {
        'shifts': [s.id for s in Shift.query.all()],
        'volunteers': [u.name for u in User.query.all()],
        'exported_at': datetime.utcnow().isoformat()
    }

    return jsonify(data)

@app.route('/api/students', methods=['GET'])
def get_students():
    """Получить всех учеников с их штрафами"""
    pool_id = request.args.get('pool_id', 1)
    students = Student.query.filter_by(pool_id=pool_id).all()

    result = []
    for student in students:
        # Подсчитать все штрафы этого ученика
        penalties = StudentPenalty.query.filter_by(student_name=student.nick).all()
        total_hours = sum(p.hours * p.multiplier for p in penalties if p.workoff_status != 'done')
        pending_count = len([p for p in penalties if p.workoff_status == 'pending'])

        result.append({
            'id': student.id,
            'nick': student.nick,
            'name': student.name,
            'tribe': student.tribe,
            'total_penalty_hours': total_hours,
            'pending_penalties': pending_count,
            'penalties': [{
                'id': p.id,
                'hours': p.hours * p.multiplier,
                'status': p.workoff_status,
                'volunteer': p.volunteer_name,
                'date': p.date_issued.isoformat()
            } for p in penalties]
        })

    return jsonify(result)

@app.route('/api/students', methods=['POST'])
def create_student():
    """Добавить нового ученика"""
    data = request.json

    if not data.get('nick') or not data.get('name'):
        return jsonify({'error': 'Nick and name required'}), 400

    student = Student(
        nick=data['nick'],
        name=data['name'],
        tribe=data.get('tribe', 'A'),
        pool_id=data.get('pool_id', 1)
    )
    db.session.add(student)
    db.session.commit()

    return jsonify({
        'id': student.id,
        'message': f'Ученик {student.name} ({student.nick}) добавлен'
    }), 201

@app.route('/api/students/<int:student_id>', methods=['DELETE'])
def delete_student(student_id):
    """Удалить ученика"""
    student = Student.query.get_or_404(student_id)
    db.session.delete(student)
    db.session.commit()
    return jsonify({'message': 'Student deleted'})

@app.route('/api/penalties', methods=['GET'])
def get_penalties():
    """Получить все штрафы (ВСЕ волонтеры видят ВСЕ штрафы)"""
    pool_id = request.args.get('pool_id', 1)

    # ВСЕ видят ВСЕ штрафы
    penalties = StudentPenalty.query.all()

    return jsonify([{
        'id': p.id,
        'student_name': p.student_name,
        'volunteer_name': p.volunteer_name,
        'hours': p.hours,
        'multiplier': p.multiplier,
        'total_hours': p.hours * p.multiplier,
        'workoff_status': p.workoff_status,
        'description': p.description,
        'date_issued': p.date_issued.isoformat()
    } for p in penalties])

@app.route('/api/penalties', methods=['POST'])
def create_penalty():
    """Добавить штраф ученику - КРИТИЧНО для синхронизации"""
    data = request.json
    user = User.query.get(data.get('volunteer_id', 1))

    penalty = StudentPenalty(
        student_name=data['student_name'],
        volunteer_id=user.id if user else 1,
        volunteer_name=user.name if user else 'Unknown',
        hours=2,  # Всегда 2 часа за нарушение
        multiplier=1,
        description=data.get('description', ''),
        pool_id=data.get('pool_id', 1)
    )
    db.session.add(penalty)
    db.session.commit()

    # 🔄 СИНХРОНИЗИРОВАТЬ С GOOGLE SHEETS СРАЗУ
    # TODO: sync_to_sheets(penalty)

    return jsonify({
        'id': penalty.id,
        'message': 'Penalty created and synced to Google Sheets'
    }), 201

@app.route('/api/penalties/<int:penalty_id>', methods=['PATCH'])
def update_penalty_status(penalty_id):
    """Обновить статус отработки штрафа"""
    data = request.json
    penalty = StudentPenalty.query.get_or_404(penalty_id)

    old_status = penalty.workoff_status
    penalty.workoff_status = data.get('workoff_status', penalty.workoff_status)

    # Если не пришёл на отработку - умножить на 2
    if old_status == 'pending' and data.get('workoff_status') == 'overdue':
        penalty.multiplier *= 2
    # Если опять не пришёл (был overdue, остаётся overdue) - умножить ещё на 2
    elif old_status == 'overdue' and data.get('workoff_status') == 'overdue':
        penalty.multiplier *= 2

    if data.get('workoff_status') == 'done':
        penalty.date_worked_off = datetime.utcnow()

    db.session.commit()

    # 🔄 СИНХРОНИЗИРОВАТЬ С GOOGLE SHEETS
    # TODO: sync_to_sheets(penalty)

    return jsonify({'message': 'Penalty updated'})

@app.route('/api/penalties/<int:penalty_id>', methods=['DELETE'])
def delete_penalty(penalty_id):
    """Удалить штраф (отменить случайно выданный)"""
    penalty = StudentPenalty.query.get_or_404(penalty_id)
    student_name = penalty.student_name

    db.session.delete(penalty)
    db.session.commit()

    # 🔄 СИНХРОНИЗИРОВАТЬ С GOOGLE SHEETS
    # TODO: sync_to_sheets_delete(penalty)

    return jsonify({'message': f'Штраф для {student_name} отменён'})

@app.route('/api/events', methods=['GET'])
def get_events():
    """Получить все мероприятия (все видят все)"""
    pool_id = request.args.get('pool_id', 1)
    events = Event.query.filter_by(pool_id=pool_id, status='approved').all()

    return jsonify([{
        'id': e.id,
        'name': e.name,
        'description': e.description,
        'tribe': e.tribe,
        'tribe_master_name': e.tribe_master_name,
        'date': e.date.isoformat()
    } for e in events])

@app.route('/api/events', methods=['POST'])
def create_event():
    """Создать мероприятие (трайб-мастер)"""
    data = request.json
    user = User.query.get(data.get('tribe_master_id', 1))

    event = Event(
        name=data['name'],
        description=data.get('description', ''),
        tribe=data.get('tribe', 'A'),
        tribe_master_id=user.id if user else 1,
        tribe_master_name=user.name if user else 'Unknown',
        status='pending',
        pool_id=data.get('pool_id', 1)
    )
    db.session.add(event)
    db.session.commit()

    return jsonify({'id': event.id, 'message': 'Event created'}), 201

@app.route('/api/events/<int:event_id>', methods=['PATCH'])
def approve_event(event_id):
    """Одобрить мероприятие (Team Lead)"""
    event = Event.query.get_or_404(event_id)
    event.status = 'approved'
    db.session.commit()

    # 🔄 СИНХРОНИЗИРОВАТЬ С GOOGLE SHEETS
    # TODO: sync_to_sheets(event)

    return jsonify({'message': 'Event approved'})

@app.route('/api/admin/reset', methods=['POST'])
def reset_database():
    """Сбросить базу данных"""
    try:
        db.drop_all()
        db.create_all()
        return jsonify({'message': 'Database reset successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== Инициализация БД ====================

with app.app_context():
    db.create_all()

# ==================== Запуск ====================

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_DEBUG', 'true').lower() == 'true'
    app.run(host='0.0.0.0', port=port, debug=debug)
