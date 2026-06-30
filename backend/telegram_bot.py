import json
import os
import time

os.environ.setdefault('SKIP_APP_WORKERS', 'true')

from app import (  # noqa: E402
    app,
    db,
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_BOT_USERNAME,
    TELEGRAM_TEST_MODE,
    TELEGRAM_POLL_INTERVAL,
    TELEGRAM_LONG_POLL_TIMEOUT,
    telegram_get,
    telegram_handle_message,
    telegram_send_message,
    process_pending_notifications,
)


def get_updates(offset=None):
    params = {
        'timeout': TELEGRAM_LONG_POLL_TIMEOUT,
        'allowed_updates': json.dumps(['message']),
    }
    if offset is not None:
        params['offset'] = offset
    return telegram_get('getUpdates', params)


def main():
    if not TELEGRAM_BOT_TOKEN:
        raise RuntimeError('Укажи TELEGRAM_BOT_TOKEN в env')

    print(f'[telegram] polling bot @{TELEGRAM_BOT_USERNAME or "unknown"} starting (test_mode={"on" if TELEGRAM_TEST_MODE else "off"})')
    offset = None

    while True:
        try:
            with app.app_context():
                process_pending_notifications()
                db.session.commit()

            updates = get_updates(offset=offset)
            for update in updates:
                offset = update['update_id'] + 1
                message = update.get('message')
                if not message:
                    continue
                with app.app_context():
                    try:
                        telegram_handle_message(message)
                        db.session.commit()
                    except Exception as exc:
                        db.session.rollback()
                        chat_id = (message.get('chat') or {}).get('id')
                        if chat_id:
                            try:
                                telegram_send_message(chat_id, f'Не получилось обработать команду: {exc}')
                            except Exception:
                                pass
            time.sleep(TELEGRAM_POLL_INTERVAL)
        except KeyboardInterrupt:
            print('[telegram] stopped')
            break
        except Exception as exc:
            with app.app_context():
                db.session.rollback()
            print(f'[telegram] loop error: {exc}')
            time.sleep(max(TELEGRAM_POLL_INTERVAL, 3))


if __name__ == '__main__':
    main()
