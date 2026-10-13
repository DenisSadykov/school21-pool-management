import json
from datetime import datetime, timedelta, timezone

import pytest
from backup_metadata import managed_backup_status
import app as platform


NOW = datetime(2026, 10, 13, 8, tzinfo=timezone.utc)


@pytest.mark.parametrize('age,status,today', [(1, 'ok', True), (24, 'ok', False), (31, 'stale', False)])
def test_verified_postgres_backup_metadata(tmp_path, age, status, today):
    path = tmp_path / 'status.json'
    path.write_text(json.dumps({'version': 1, 'verified': True,
        'verified_at': (NOW - timedelta(hours=age)).isoformat(), 'size_bytes': 3000000}))
    result = managed_backup_status(path, now=NOW)
    assert (result['status'], result['today_exists']) == (status, today)
    assert result['provider'] == 'postgresql'
    assert result['offsite_status'] == 'not_monitored'
    assert result['manual_available'] is False
    assert 'backup_dir' not in result


@pytest.mark.parametrize('content', ['broken', '{}', '[]', 'x' * 5000,
    '{"version":1,"verified":false}',
    json.dumps({'version': 1, 'verified': True, 'verified_at': '2026-10-13T08:00:00', 'size_bytes': 5}),
    json.dumps({'version': 1, 'verified': True, 'verified_at': '2030-10-13T08:00:00+00:00', 'size_bytes': 5})])
def test_missing_or_invalid_backup_is_unknown_not_missing_today(tmp_path, content):
    path = tmp_path / 'status.json'
    assert managed_backup_status(path, now=NOW)['today_exists'] is None
    path.write_text(content)
    result = managed_backup_status(path, now=NOW)
    assert result['status'] == 'unknown'
    assert result['today_exists'] is None


def test_production_backup_does_not_claim_excel_is_full_database_backup(
    client, factories, auth_headers, monkeypatch,
):
    admin = factories.user('admin', role='admin')
    monkeypatch.setenv('FLASK_ENV', 'production')
    monkeypatch.setenv('BACKUP_STATUS_FILE', '/nonexistent/synthetic-status.json')
    monkeypatch.delenv('VERCEL', raising=False)
    response = client.get('/api/admin/backup-status', headers=auth_headers(admin))
    assert response.status_code == 200
    assert response.get_json()['provider'] == 'postgresql'
    assert response.get_json()['status'] == 'unknown'
    response = client.post('/api/admin/backup-now', headers=auth_headers(admin))
    assert response.status_code == 409
    assert 'serverless' not in response.get_json()['error']
