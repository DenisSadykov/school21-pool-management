import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile

import pytest

spec = importlib.util.spec_from_file_location('receiver', Path(__file__).parents[1] / 'deploy-receiver.py')
receiver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(receiver)


def archive(files):
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode='w:gz') as tar:
        for name, content in files.items():
            info = tarfile.TarInfo(name)
            info.size = len(content)
            tar.addfile(info, io.BytesIO(content))
    return buffer.getvalue()


FILES = {'backend/app.py': b'app', 'backend/requirements.txt': b'', 'frontend/build/index.html': b'new'}


def test_public_directories_are_accessible_to_nginx(tmp_path):
    receiver.unpack(archive({**FILES, 'frontend/build/static/js/main.js': b'js'}), tmp_path)
    for directory in ['frontend/build', 'frontend/build/static', 'frontend/build/static/js']:
        assert (tmp_path / directory).stat().st_mode & 0o777 == 0o755


@pytest.mark.parametrize('name', ['/etc/passwd', 'backend/../../etc/passwd', 'secure/key', 'backend/.env'])
def test_rejects_unsafe_paths(tmp_path, name):
    with pytest.raises(ValueError):
        receiver.unpack(archive({**FILES, name: b'private'}), tmp_path)


def test_rejects_symlinks(tmp_path):
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode='w:gz') as tar:
        info = tarfile.TarInfo('backend/app.py')
        info.type = tarfile.SYMTYPE
        info.linkname = '/etc/passwd'
        tar.addfile(info)
    with pytest.raises(ValueError):
        receiver.unpack(buffer.getvalue(), tmp_path)


@pytest.mark.parametrize('failure_phase', ['candidate', 'live', None])
def test_activation_and_rollback_preserve_data(tmp_path, monkeypatch, failure_phase):
    root = tmp_path
    (root / 'secure').mkdir()
    (root / 'frontend/build').mkdir(parents=True)
    (root / 'frontend/build/index.html').write_text('old')
    (root / 'secure/keep.env').write_text('private')
    releases = root / 'releases'
    calls = []
    monkeypatch.setattr(receiver, 'ROOT', root)
    monkeypatch.setattr(receiver, 'RELEASES', releases)
    monkeypatch.setattr(sys, 'stdin', type('Input', (), {'buffer': io.BytesIO(b'a' * 40 + b'\n' + archive(FILES))})())
    monkeypatch.setattr(receiver, 'output', lambda args: json.dumps([{'Config': {'Env': ['SECRET_KEY=private']}}]) if args[-1] != '{{.Image}}' else 'old-image')
    def run(args, **kwargs):
        calls.append(args)
        return subprocess.CompletedProcess(args, 0)
    monkeypatch.setattr(receiver, 'run', run)
    monkeypatch.setattr(receiver.subprocess, 'run', run)
    monkeypatch.setattr(receiver, 'healthy', lambda _: None)
    failed = False
    def smoke(container, readonly=False):
        nonlocal failed
        if not failed and ((failure_phase == 'candidate' and container != receiver.BACKEND) or (failure_phase == 'live' and container == receiver.BACKEND)):
            failed = True
            raise RuntimeError('Simulated failure')
    monkeypatch.setattr(receiver, 'smoke', smoke)
    if failure_phase:
        with pytest.raises(RuntimeError):
            receiver.main()
    else:
        receiver.main()
    expected = 'new' if failure_phase is None else 'old'
    assert (root / 'frontend/build/index.html').read_text() == expected
    assert (root / 'secure/keep.env').read_text() == 'private'
    assert not list(releases.glob('*/candidate.env'))
    assert not any('down' in args or 'pg_restore' in args for args in calls)
    if failure_phase == 'candidate':
        assert not any('up' in args for args in calls)
    if failure_phase == 'live':
        assert ['docker', 'tag', 'old-image', receiver.IMAGE + ':latest'] in calls
