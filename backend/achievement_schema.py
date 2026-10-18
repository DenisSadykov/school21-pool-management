"""Only the two manual-achievement tables; shared by the app and explicit migration."""
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, LargeBinary, String, Table, UniqueConstraint


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def achievement_tables(metadata):
    catalog = Table(
        'manual_achievements', metadata,
        Column('id', Integer, primary_key=True),
        Column('key', String(100), nullable=False, unique=True),
        Column('title', String(140), nullable=False),
        Column('image_data', LargeBinary, nullable=False),
        Column('image_mime', String(30), nullable=False),
        Column('image_sha256', String(64), nullable=False),
        Column('created_by', Integer, ForeignKey('users.id', ondelete='SET NULL')),
        Column('created_at', DateTime, nullable=False, default=utcnow),
    )
    awards = Table(
        'user_achievements', metadata,
        Column('id', Integer, primary_key=True),
        Column('achievement_id', Integer, ForeignKey('manual_achievements.id'), nullable=False),
        Column('user_id', Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        Column('granted_by', Integer, ForeignKey('users.id', ondelete='SET NULL')),
        Column('granted_by_nick', String(100), nullable=False),
        Column('granted_at', DateTime, nullable=False, default=utcnow),
        UniqueConstraint('achievement_id', 'user_id', name='uq_user_manual_achievement'),
    )
    return catalog, awards
