"""Read only non-sensitive host backup metadata, never the database archive."""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path


def managed_backup_status(path, now=None):
    now = now or datetime.now(timezone.utc)
    result = {'provider': 'postgresql', 'persistent': True, 'manual_available': False,
              'status': 'unknown', 'latest_at': None, 'today_exists': None,
              'offsite_status': 'not_monitored'}
    try:
        with Path(path).open('rb') as source:
            content = source.read(4097)
        if len(content) > 4096:
            return result
        metadata = json.loads(content)
        if metadata.get('version') != 1 or metadata.get('verified') is not True:
            return result
        verified_at = datetime.fromisoformat(metadata['verified_at'])
        if verified_at.tzinfo is None or verified_at > now + timedelta(minutes=5):
            return result
        size = metadata['size_bytes']
        if not isinstance(size, int) or isinstance(size, bool) or size <= 0:
            return result
        result.update(status='ok' if now - verified_at <= timedelta(hours=30) else 'stale',
                      latest_at=verified_at.isoformat(), size_bytes=size,
                      today_exists=verified_at.astimezone(timezone(timedelta(hours=3))).date()
                      == now.astimezone(timezone(timedelta(hours=3))).date())
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        pass
    return result
