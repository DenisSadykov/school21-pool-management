import importlib.util
import json
from pathlib import Path

import pytest


spec = importlib.util.spec_from_file_location('backup_writer', Path(__file__).parents[1] / 'write-backup-status.py')
writer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(writer)


def test_status_contains_only_metadata_with_private_permissions(tmp_path):
    dump = tmp_path / 'sample.dump'
    dump.write_bytes(b'fake archive contents for unit test')
    target = tmp_path / 'status' / 'status.json'
    writer.publish(dump, target)
    record = json.loads(target.read_text())
    assert set(record) == {'version', 'verified', 'verified_at', 'size_bytes'}
    assert record['size_bytes'] == dump.stat().st_size
    assert record['verified'] is True
    assert target.stat().st_mode & 0o777 == 0o600
    assert not target.with_suffix('.partial').exists()


def test_no_status_for_empty_archive(tmp_path):
    dump = tmp_path / 'sample.dump'
    dump.touch()
    target = tmp_path / 'status.json'
    with pytest.raises(ValueError):
        writer.publish(dump, target)
    assert not target.exists()
