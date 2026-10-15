import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

import pytest


spec = importlib.util.spec_from_file_location(
    'offsite_backup', Path(__file__).parents[1] / 'offsite-backup.py')
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)

POOL = 'pool-20261015T020000Z.dump'
CONFIG = 'config-20261015T020000Z.tar.gz'


def record(name=POOL, contents=b'verified archive'):
    return {'name': name, 'sha256': hashlib.sha256(contents).hexdigest(), 'size': len(contents)}


def manifest(*records):
    return json.dumps({'version': 1, 'archives': list(records)}).encode()


def fake_remote(monkeypatch, payload, archives=None, failures=None):
    calls = []
    failures = list(failures or [])

    def run(args, **kwargs):
        calls.append((args, kwargs))
        if failures:
            failure = failures.pop(0)
            if failure:
                raise failure
        if args[0] == '/usr/bin/ssh':
            assert args[-1] == 'python3 -'
            assert kwargs['input'] == backup.REMOTE_MANIFEST_SCRIPT
            return subprocess.CompletedProcess(args, 0, payload, b'')
        assert args[0] == '/usr/bin/scp'
        name = args[-2].rsplit('/', 1)[-1]
        Path(args[-1]).write_bytes(archives[name])
        return subprocess.CompletedProcess(args, 0, b'', b'')

    monkeypatch.setattr(backup.subprocess, 'run', run)
    return calls


def test_manifest_once_downloads_two_verified_archives_and_private_metadata(tmp_path, monkeypatch):
    contents = {POOL: b'pool archive', CONFIG: b'protected configuration'}
    calls = fake_remote(monkeypatch, manifest(*(record(name, data) for name, data in contents.items())), contents)
    assert backup.sync_backups(tmp_path) == 2
    assert len(calls) == 3
    assert sum(args[0] == '/usr/bin/ssh' for args, _ in calls) == 1
    assert tmp_path.stat().st_mode & 0o777 == 0o700
    for name, data in contents.items():
        assert (tmp_path / name).read_bytes() == data
        assert (tmp_path / (name + '.sha256')).read_text() == record(name, data)['sha256'] + '  ' + name + '\n'
    assert (tmp_path / 'last-success.txt').read_text().strip()
    for path in tmp_path.iterdir():
        assert path.stat().st_mode & 0o777 == 0o600
    for args, kwargs in calls:
        assert 'StrictHostKeyChecking=yes' in args
        assert backup.HOST in args or any(arg.startswith(backup.HOST + ':') for arg in args)
        assert kwargs['timeout'] == 240


def test_noop_reuses_matching_digest_without_archive_calls(tmp_path, monkeypatch):
    data = b'already verified'
    target = tmp_path / POOL
    target.write_bytes(data)
    target.chmod(0o644)
    inode = target.stat().st_ino
    calls = fake_remote(monkeypatch, manifest(record(contents=data)))
    assert backup.sync_backups(tmp_path) == 0
    assert len(calls) == 1
    assert target.stat().st_ino == inode
    assert target.stat().st_mode & 0o777 == 0o600
    assert not list(tmp_path.glob('*.previous-*'))


def test_differing_local_archive_is_preserved_before_atomic_replace(tmp_path, monkeypatch):
    old, new = b'old differing archive', b'correct remote archive'
    target = tmp_path / POOL
    target.write_bytes(old)
    fake_remote(monkeypatch, manifest(record(contents=new)), {POOL: new})
    original_replace = backup.os.replace
    seen_archive_replace = []

    def replace(source, destination):
        if Path(destination) == target:
            # The old target remains present until this one atomic operation.
            assert target.read_bytes() == old
            previous = list(tmp_path.glob(POOL + '.previous-*'))
            assert len(previous) == 1 and previous[0].read_bytes() == old
            seen_archive_replace.append(True)
        original_replace(source, destination)

    monkeypatch.setattr(backup.os, 'replace', replace)
    assert backup.sync_backups(tmp_path) == 1
    assert seen_archive_replace == [True]
    assert target.read_bytes() == new
    assert list(tmp_path.glob(POOL + '.previous-*'))[0].stat().st_mode & 0o777 == 0o600


def test_corrupt_download_preserves_existing_archive_and_success_marker(tmp_path, monkeypatch):
    old = b'previous archive'
    (tmp_path / POOL).write_bytes(old)
    (tmp_path / 'last-success.txt').write_text('previous success\n')
    calls = fake_remote(monkeypatch, manifest(record(contents=b'expected archive')), {POOL: b'corrupt archive!'})
    sleeps = []
    monkeypatch.setattr(backup.time, 'sleep', sleeps.append)
    with pytest.raises(backup.BackupFailure, match='verification/checksum'):
        backup.sync_backups(tmp_path)
    assert (tmp_path / POOL).read_bytes() == old
    assert (tmp_path / 'last-success.txt').read_text() == 'previous success\n'
    assert not list(tmp_path.glob('*.previous-*'))
    assert not list(tmp_path.glob('.download-*'))
    assert len(calls) == 2 and not sleeps


def test_partial_sync_never_publishes_success_marker(tmp_path, monkeypatch):
    (tmp_path / 'last-success.txt').write_text('previous success\n')
    records = [record(CONFIG, b'valid'), record(POOL, b'valid')]
    fake_remote(monkeypatch, manifest(*records), {CONFIG: b'valid', POOL: b'wrong'})
    with pytest.raises(backup.BackupFailure, match='verification/checksum'):
        backup.sync_backups(tmp_path)
    assert (tmp_path / CONFIG).read_bytes() == b'valid'
    assert not (tmp_path / POOL).exists()
    assert (tmp_path / 'last-success.txt').read_text() == 'previous success\n'


@pytest.mark.parametrize('error', [
    subprocess.CalledProcessError(255, 'ssh', stderr=b'Connection timed out'),
    subprocess.CalledProcessError(255, 'ssh', stderr=b'Connection reset by peer'),
    subprocess.CalledProcessError(255, 'ssh', stderr=b'Connection closed by remote host'),
    subprocess.TimeoutExpired('ssh', 240),
])
def test_transient_failure_retries_and_succeeds(tmp_path, monkeypatch, error):
    data = b'archive'
    (tmp_path / POOL).write_bytes(data)
    calls = fake_remote(monkeypatch, manifest(record(contents=data)), failures=[error, error, None])
    sleeps = []
    monkeypatch.setattr(backup.time, 'sleep', sleeps.append)
    assert backup.sync_backups(tmp_path) == 0
    assert len(calls) == 3 and sleeps == [1, 2]


def test_transient_download_retries_only_the_new_archive(tmp_path, monkeypatch):
    data = b'archive'
    failure = subprocess.CalledProcessError(255, 'scp', stderr=b'Connection reset by peer')
    calls = fake_remote(monkeypatch, manifest(record(contents=data)), {POOL: data}, [None, failure, None])
    sleeps = []
    monkeypatch.setattr(backup.time, 'sleep', sleeps.append)
    assert backup.sync_backups(tmp_path) == 1
    assert [Path(args[0]).name for args, _ in calls] == ['ssh', 'scp', 'scp']
    assert sleeps == [1]


def test_timeout_with_authentication_error_does_not_retry(tmp_path, monkeypatch):
    failure = subprocess.TimeoutExpired('ssh', 240, stderr=b'Permission denied (publickey)')
    calls = fake_remote(monkeypatch, b'', failures=[failure])
    sleeps = []
    monkeypatch.setattr(backup.time, 'sleep', sleeps.append)
    with pytest.raises(backup.BackupFailure, match='manifest/authentication'):
        backup.sync_backups(tmp_path)
    assert len(calls) == 1 and not sleeps


def test_exhausted_timeout_has_bounded_attempts_and_no_success(tmp_path, monkeypatch):
    failure = subprocess.TimeoutExpired('ssh', 240)
    calls = fake_remote(monkeypatch, b'', failures=[failure] * 3)
    sleeps = []
    monkeypatch.setattr(backup.time, 'sleep', sleeps.append)
    with pytest.raises(backup.BackupFailure, match='manifest/timeout'):
        backup.sync_backups(tmp_path)
    assert len(calls) == 3 and sleeps == [1, 2]
    assert not (tmp_path / 'last-success.txt').exists()


@pytest.mark.parametrize('stderr,category', [
    (b'Permission denied (publickey). Connection reset', 'authentication'),
    (b'Host key verification failed.', 'host-key'),
    (b'REMOTE HOST IDENTIFICATION HAS CHANGED!', 'host-key'),
    (backup.MANIFEST_INVALID, 'invalid-manifest'),
    (b'Unknown remote command error', 'command'),
])
def test_permanent_failures_do_not_retry(tmp_path, monkeypatch, stderr, category):
    failure = subprocess.CalledProcessError(255, 'ssh', stderr=stderr)
    calls = fake_remote(monkeypatch, b'', failures=[failure])
    sleeps = []
    monkeypatch.setattr(backup.time, 'sleep', sleeps.append)
    with pytest.raises(backup.BackupFailure, match='manifest/' + category):
        backup.sync_backups(tmp_path)
    assert len(calls) == 1 and not sleeps


@pytest.mark.parametrize('payload', [
    b'not json', b'{}', manifest(), b'{"version":1,"version":1,"archives":[]}',
    manifest(record('../' + POOL)), manifest(record('/' + POOL)),
    manifest(record(POOL + '.partial')), manifest(record(), record()),
    manifest(dict(record(), sha256='A' * 64)), manifest(dict(record(), size=True)),
    manifest(dict(record(), size=0)), manifest(dict(record(), extra='unexpected')),
])
def test_invalid_manifest_rejected_without_download_or_timestamp(tmp_path, monkeypatch, payload):
    calls = fake_remote(monkeypatch, payload)
    with pytest.raises(backup.BackupFailure, match='manifest/invalid-manifest'):
        backup.sync_backups(tmp_path)
    assert len(calls) == 1
    assert not (tmp_path / 'last-success.txt').exists()


@pytest.mark.parametrize('name', [POOL, POOL + '.sha256', '.download.lock', 'last-success.txt'])
def test_local_symlinks_rejected_without_touching_their_target(tmp_path, monkeypatch, name):
    outside = tmp_path.parent / ('outside-' + name.replace('.', '_'))
    outside.write_bytes(b'keep unchanged')
    (tmp_path / name).symlink_to(outside)
    fake_remote(monkeypatch, manifest(record()))
    with pytest.raises(backup.BackupFailure, match='local/unsafe-file'):
        backup.sync_backups(tmp_path)
    assert outside.read_bytes() == b'keep unchanged'


def test_destination_symlink_is_rejected(tmp_path):
    link = tmp_path / 'linked-destination'
    link.symlink_to(tmp_path, target_is_directory=True)
    with pytest.raises(backup.BackupFailure, match='local/unsafe-directory'):
        backup.sync_backups(link)


def test_downloaded_symlink_is_rejected_without_success_marker(tmp_path, monkeypatch):
    outside = tmp_path.parent / 'outside-downloaded-archive'
    outside.write_bytes(b'unchanged outside archive')

    def run(args, **kwargs):
        if args[0] == '/usr/bin/ssh':
            return subprocess.CompletedProcess(args, 0, manifest(record()), b'')
        Path(args[-1]).symlink_to(outside)
        return subprocess.CompletedProcess(args, 0, b'', b'')

    monkeypatch.setattr(backup.subprocess, 'run', run)
    with pytest.raises(backup.BackupFailure, match='local/unsafe-file'):
        backup.sync_backups(tmp_path)
    assert outside.read_bytes() == b'unchanged outside archive'
    assert not (tmp_path / POOL).exists()
    assert not (tmp_path / 'last-success.txt').exists()


def test_lock_contention_skips_all_remote_commands(tmp_path, monkeypatch):
    calls = fake_remote(monkeypatch, manifest(record()))
    with (tmp_path / '.download.lock').open('a') as lock:
        backup.fcntl.flock(lock, backup.fcntl.LOCK_EX | backup.fcntl.LOCK_NB)
        assert backup.sync_backups(tmp_path) is None
    assert not calls
    assert not (tmp_path / 'last-success.txt').exists()


def test_cli_errors_are_fixed_codes_without_subprocess_details(monkeypatch, capsys):
    def fail():
        raise backup.BackupFailure('download', 'authentication')
    monkeypatch.setattr(backup, 'sync_backups', fail)
    assert backup.main() == 1
    assert capsys.readouterr().out == 'Backup sync failed; phase=download; category=authentication\n'


def run_snapshot(tmp_path):
    script = backup.REMOTE_MANIFEST_SCRIPT.decode().replace('ROOT = ' + repr(backup.REMOTE),
                                                           'ROOT = ' + repr(str(tmp_path)), 1)
    return subprocess.run([sys.executable, '-'], input=script.encode(), capture_output=True)


def test_remote_snapshot_filters_partial_and_missing_checksum(tmp_path):
    for name in [POOL, CONFIG, POOL.replace('020000', '030000'), POOL + '.partial']:
        (tmp_path / name).write_bytes(b'archive')
    for name in [POOL, CONFIG]:
        checksum = record(name, b'archive')['sha256']
        (tmp_path / (name + '.sha256')).write_text(checksum + '  ' + str(tmp_path / name) + '\n')
    result = run_snapshot(tmp_path)
    assert result.returncode == 0
    records = backup.parse_manifest(result.stdout)
    assert {entry['name'] for entry in records} == {POOL, CONFIG}


@pytest.mark.parametrize('unsafe', ['archive-symlink', 'checksum-symlink', 'bad-checksum', 'wrong-name'])
def test_remote_snapshot_rejects_unsafe_entries(tmp_path, unsafe):
    target = tmp_path / POOL
    target.write_bytes(b'archive')
    sidecar = tmp_path / (POOL + '.sha256')
    sidecar.write_text(record(contents=b'archive')['sha256'] + '  ' + POOL + '\n')
    if unsafe == 'archive-symlink':
        target.unlink()
        target.symlink_to(sidecar)
    elif unsafe == 'checksum-symlink':
        sidecar.unlink()
        sidecar.symlink_to(target)
    elif unsafe == 'bad-checksum':
        sidecar.write_text('invalid checksum')
    else:
        sidecar.write_text(record()['sha256'] + '  ../' + POOL + '\n')
    result = run_snapshot(tmp_path)
    assert result.returncode == 2
    assert result.stdout == b''
    assert result.stderr == backup.MANIFEST_INVALID + b'\n'
