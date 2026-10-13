#!/usr/bin/env python3
"""Publish minimal status only after backup.sh verified the dump archive."""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path


def publish(dump_path, status_path):
    dump = Path(dump_path)
    if not dump.is_file() or dump.suffix != '.dump' or dump.stat().st_size <= 0:
        raise ValueError('A non-empty verified dump is required')
    target = Path(status_path)
    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    temporary = target.with_suffix('.partial')
    record = {'version': 1, 'verified': True, 'verified_at': datetime.now(timezone.utc).isoformat(),
              'size_bytes': dump.stat().st_size}
    with temporary.open('w') as output:
        os.chmod(temporary, 0o600)
        json.dump(record, output)
    temporary.replace(target)


if __name__ == '__main__':
    publish(*sys.argv[1:])
