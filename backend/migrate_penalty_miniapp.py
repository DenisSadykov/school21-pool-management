"""Explicit, additive Mini App schema upgrade. Back up the database first.

Run using the same DATABASE_URL as the API, before publishing the new app.
Creates only the two new work-off tables and their indexes. Never seeds data,
starts workers, sends Telegram messages, or alters existing penalty records.
"""
import os

os.environ['AUTO_INIT_DB'] = 'false'
os.environ['RUN_SCHEMA_MIGRATIONS'] = 'false'
os.environ['AUTO_START_WORKERS'] = 'false'
os.environ['AUTO_SYNC_TELEGRAM_COMMANDS'] = 'false'

from app import app, db, PenaltyWorkoffSession, PenaltyWorkoffTask  # noqa: E402


def migrate():
    with app.app_context(), db.engine.begin() as connection:
        if connection.dialect.name == 'postgresql':
            connection.exec_driver_sql("SELECT pg_advisory_xact_lock(hashtext('school21-pool-management-schema'))")
        PenaltyWorkoffSession.__table__.create(connection, checkfirst=True)
        PenaltyWorkoffTask.__table__.create(connection, checkfirst=True)


if __name__ == '__main__':
    migrate()
    print('Mini App schema ready; existing data unchanged.')
