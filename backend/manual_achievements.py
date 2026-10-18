"""Private manual awards, immutable catalog and atomic, opt-in notifications."""
import hashlib
import re
from io import BytesIO

from flask import g, jsonify, request, send_file
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert


MAX_IMAGE_BYTES = 3 * 1024 * 1024
EVENT_TYPE = 'manual_achievement_awarded'


def register_manual_achievements(app, db, context):
    Catalog = context['ManualAchievement']
    Award = context['UserAchievement']
    User = context['User']
    Event = context['NotificationEvent']

    def insert_once(model, values, unique_columns):
        dialect = db.engine.dialect.name
        if dialect not in {'postgresql', 'sqlite'}:
            raise RuntimeError('Unsupported achievement database')
        insert = pg_insert if dialect == 'postgresql' else sqlite_insert
        return db.session.execute(insert(model.__table__).values(**values).on_conflict_do_nothing(
            index_elements=unique_columns,
        ).returning(model.id)).scalar_one_or_none()

    def catalog_payload(item):
        return {'id': item.id, 'key': item.key, 'title': item.title,
                'image_url': f'/api/achievements/{item.id}/image'}

    def award_payload(award, item):
        return {**catalog_payload(item), 'award_id': award.id,
                'granted_at': award.granted_at.isoformat(timespec='seconds') + 'Z'}

    def notification_status(award_id):
        event = Event.query.filter_by(dedupe_key=f'manual-achievement:{award_id}').first()
        return event.status if event else 'not_requested'

    def lock_users(recipient_id=None):
        # Same ordering for all award writes, including an admin awarding themself.
        ids = sorted({g.user.id, recipient_id} - {None})
        users = {user.id: user for user in User.query.filter(User.id.in_(ids)).order_by(
            User.id).populate_existing().with_for_update().all()}
        actor = users.get(g.user.id)
        if not actor or not actor.active or actor.role != 'admin' or not context['load_user_from_request']():
            return None, None
        return actor, users.get(recipient_id)

    @app.get('/api/me/achievements')
    @context['require_auth']
    def my_achievements():
        rows = db.session.query(Award, Catalog).join(Catalog, Catalog.id == Award.achievement_id).filter(
            Award.user_id == g.user.id).order_by(Award.granted_at.desc(), Award.id.desc()).all()
        response = jsonify([award_payload(award, item) for award, item in rows])
        response.headers['Cache-Control'] = 'private, no-store'
        return response

    @app.get('/api/achievements/<int:achievement_id>/image')
    @context['require_auth']
    def achievement_image(achievement_id):
        if g.user.role != 'admin' and not Award.query.filter_by(
                achievement_id=achievement_id, user_id=g.user.id).first():
            return jsonify({'error': 'Ачивка не найдена'}), 404
        item = db.session.get(Catalog, achievement_id)
        if not item:
            return jsonify({'error': 'Ачивка не найдена'}), 404
        response = send_file(BytesIO(item.image_data), mimetype=item.image_mime)
        response.headers['Cache-Control'] = 'private, no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response

    @app.post('/api/admin/achievements')
    @context['require_role']('admin')
    def create_manual_achievement():
        key = (request.form.get('key') or '').strip()
        title = (request.form.get('title') or '').strip()
        if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,99}', key):
            return jsonify({'error': 'Нужен постоянный ключ ачивки: латинские буквы, цифры и дефисы'}), 400
        if not 1 <= len(title) <= 140:
            return jsonify({'error': 'Название должно содержать от 1 до 140 символов'}), 400
        file = request.files.get('file')
        if not file:
            return jsonify({'error': 'Загрузите изображение ачивки'}), 400
        content = file.read(MAX_IMAGE_BYTES + 1)
        mime = context['_detected_image_mime'](content)
        if not content or len(content) > MAX_IMAGE_BYTES:
            return jsonify({'error': 'Нужно непустое изображение размером не больше 3 МБ'}), 400
        if mime not in {'image/png', 'image/jpeg', 'image/webp'} or mime != file.mimetype:
            return jsonify({'error': 'Поддерживаются изображения PNG, JPG и WEBP; содержимое должно соответствовать формату'}), 400
        actor, _ = lock_users()
        if not actor:
            db.session.rollback()
            return jsonify({'error': 'Недостаточно прав'}), 403
        digest = hashlib.sha256(content).hexdigest()
        item_id = insert_once(Catalog, dict(key=key, title=title, image_data=content,
                             image_mime=mime, image_sha256=digest, created_by=actor.id), ['key'])
        item = Catalog.query.filter_by(key=key).one()
        if not item_id and (item.title != title or item.image_sha256 != digest):
            db.session.rollback()
            return jsonify({'error': 'Этот ключ уже принадлежит другой ачивке; выданные изображения не заменяются'}), 409
        if item_id:
            context['log_action']('create', 'manual_achievement', item.id,
                                  'Создана ручная ачивка', {'key': key, 'title': title}, actor=actor)
        db.session.commit()
        return jsonify(catalog_payload(item)), 201 if item_id else 200

    @app.post('/api/admin/achievements/<int:achievement_id>/awards')
    @context['require_role']('admin')
    def grant_manual_achievement(achievement_id):
        data = request.get_json(silent=True)
        if not isinstance(data, dict) or type(data.get('user_id')) is not int or data['user_id'] <= 0:
            return jsonify({'error': 'Укажите идентификатор получателя'}), 400
        notify = data.get('notify', False)
        if type(notify) is not bool:
            return jsonify({'error': 'notify должен быть true или false'}), 400
        actor, recipient = lock_users(data['user_id'])
        if not actor:
            db.session.rollback()
            return jsonify({'error': 'Недостаточно прав'}), 403
        if not recipient or not recipient.active:
            db.session.rollback()
            return jsonify({'error': 'Активный получатель не найден'}), 404
        item = db.session.get(Catalog, achievement_id)
        if not item:
            db.session.rollback()
            return jsonify({'error': 'Ачивка не найдена'}), 404
        award_id = insert_once(Award, dict(achievement_id=item.id, user_id=recipient.id,
                               granted_by=actor.id, granted_by_nick=actor.nick), ['achievement_id', 'user_id'])
        award = Award.query.filter_by(achievement_id=item.id, user_id=recipient.id).one()
        if award_id:
            if notify:
                # Account-level award: survives pool changes. The dispatcher still
                # checks active user, linked account, delivery preference and quiet hours.
                context['_queue_notification'](
                    recipient, EVENT_TYPE,
                    f'Тебе выдана ачивка „{item.title}“! Она уже в твоём личном кабинете',
                    f'manual-achievement:{award.id}', source_entity='user_achievement',
                    source_entity_id=award.id, created_by=actor.id,
                    action_buttons=[{'text': 'Открыть ачивки',
                                     'url': context['frontend_urls'][0].rstrip('/') + '/profile?tab=achievements'}],
                )
            context['log_action']('grant', 'user_achievement', award.id, 'Выдана ручная ачивка',
                                  {'achievement_id': item.id, 'recipient_user_id': recipient.id,
                                   'notify': notify}, actor=actor)
        db.session.commit()
        return jsonify({**award_payload(award, item), 'created': bool(award_id),
                        'notification_status': notification_status(award.id)}), 201 if award_id else 200
