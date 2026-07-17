import os


os.environ.setdefault('AUTO_INIT_DB', 'false')
os.environ.setdefault('RUN_SCHEMA_MIGRATIONS', 'false')
os.environ.setdefault('AUTO_SYNC_TELEGRAM_COMMANDS', 'false')

from app import app, run_database_migrations  # noqa: E402


if __name__ == '__main__':
    with app.app_context():
        run_database_migrations()
    print('Database migrations completed successfully.')
