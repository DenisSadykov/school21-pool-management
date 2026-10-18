"""Host-admin helper for owner-authorized chat requests. Dry-run unless --apply.

Run inside the backend with compose-live.sh. Reuses the admin API, including its
password/role checks, audit trail and idempotency. Never prints a session token.
"""
import argparse
import io
import json
import os
import sys
from pathlib import Path

for setting in ('AUTO_INIT_DB', 'RUN_SCHEMA_MIGRATIONS', 'AUTO_START_WORKERS', 'AUTO_SYNC_TELEGRAM_COMMANDS'):
    os.environ[setting] = 'false'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--admin-nick', required=True, help='Explicit active admin author for the audit trail')
    parser.add_argument('--apply', action='store_true')
    actions = parser.add_subparsers(dest='action', required=True)
    create = actions.add_parser('create')
    create.add_argument('--key', required=True)
    create.add_argument('--title', required=True)
    create.add_argument('--image', required=True, help='File path, or - for stdin')
    grant = actions.add_parser('grant')
    grant.add_argument('--key', required=True)
    grant.add_argument('--recipient', required=True, help='Exact platform nickname, not a Telegram handle')
    grant.add_argument('--notify', action='store_true', help='Opt in for this first grant only')
    options = parser.parse_args()
    import app as module
    from manual_achievements import MAX_IMAGE_BYTES

    with module.app.app_context():
        actors = module.User.query.filter(module.db.func.lower(module.User.nick) == options.admin_nick.lower()).all()
        if (len(actors) != 1 or not actors[0].active or actors[0].role != 'admin'
                or not actors[0].password_hash or module.must_change_password(actors[0])):
            raise SystemExit('An active admin with a changed password is required; nothing changed.')
        actor = actors[0]
        item = module.ManualAchievement.query.filter_by(key=options.key).first()
        if options.action == 'create':
            if options.image == '-':
                content = sys.stdin.buffer.read(MAX_IMAGE_BYTES + 1)
            else:
                with Path(options.image).open('rb') as source:
                    content = source.read(MAX_IMAGE_BYTES + 1)
            mime = module._detected_image_mime(content)
            if not content or len(content) > MAX_IMAGE_BYTES or mime not in {'image/png', 'image/jpeg', 'image/webp'}:
                raise SystemExit('Expected a PNG/JPG/WEBP image no larger than 3 MiB; nothing changed.')
            if not options.apply:
                print(json.dumps({'dry_run': True, 'catalog_exists': bool(item), 'image_bytes': len(content)}))
                return
            route = '/api/admin/achievements'
            arguments = {'data': {'key': options.key, 'title': options.title,
                                   'file': (io.BytesIO(content), 'achievement', mime)}}
        else:
            recipients = module.User.query.filter(module.db.func.lower(module.User.nick) == options.recipient.lower()).all()
            if not item or len(recipients) != 1 or not recipients[0].active:
                raise SystemExit('Expected an existing achievement and one active exact recipient; nothing changed.')
            recipient = recipients[0]
            award = module.UserAchievement.query.filter_by(achievement_id=item.id, user_id=recipient.id).first()
            if not options.apply:
                account = module._telegram_account_any(recipient.id)
                print(json.dumps({'dry_run': True, 'award_exists': bool(award), 'notify_requested': options.notify,
                                  'telegram_ready': bool(account and account.is_linked and account.delivery_enabled and account.telegram_chat_id)}))
                return
            route = f'/api/admin/achievements/{item.id}/awards'
            arguments = {'json': {'user_id': recipient.id, 'notify': options.notify}}
        headers = {'Authorization': 'Bearer ' + module.make_token(actor)}
        # End the inspection transaction before the normal route acquires locks.
        module.db.session.rollback()
        with module.app.test_client() as client:
            response = client.post(route, headers=headers, **arguments)
        print(json.dumps({'http_status': response.status_code, 'result': response.json}, ensure_ascii=False))
        if response.status_code not in (200, 201):
            raise SystemExit(1)


if __name__ == '__main__':
    main()
