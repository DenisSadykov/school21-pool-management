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
