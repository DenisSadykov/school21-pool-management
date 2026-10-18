"""Explicit additive migration. Run only after approval and a verified backup.

Does not import the application, seed awards, start workers or send messages.
Use the current backend DATABASE_URL; run before deploying the new application.
"""
import os

from sqlalchemy import Column, Integer, MetaData, Table, create_engine
from achievement_schema import achievement_tables


def migrate(engine):
    metadata = MetaData()
    # Resolve foreign keys without creating or altering the existing users table.
    Table('users', metadata, Column('id', Integer, primary_key=True))
    catalog, awards = achievement_tables(metadata)
    with engine.begin() as connection:
        if connection.dialect.name == 'postgresql':
            connection.exec_driver_sql("SELECT pg_advisory_xact_lock(hashtext('school21-pool-management-schema'))")
        catalog.create(connection, checkfirst=True)
        awards.create(connection, checkfirst=True)


if __name__ == '__main__':
    migrate(create_engine(os.environ['DATABASE_URL']))
    print('Manual achievement tables ready; no awards or notifications created.')
