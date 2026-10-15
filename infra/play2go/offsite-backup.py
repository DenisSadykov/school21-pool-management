#!/usr/bin/python3
"""Download completed VM backups without exposing secrets or unverified archives."""

import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile
import time
import uuid


DEST = Path('/Users/denissadykov/school21-pool-management/backups/play2go-copy')
REMOTE = '/opt/school21-pool-copy/secure/backups'
HOST = 'root@31.77.148.136'
OPTIONS = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15',
           '-o', 'StrictHostKeyChecking=yes', '-o', 'ServerAliveInterval=15',
           '-o', 'ServerAliveCountMax=3']
NAME = re.compile(r'(?:pool-\d{8}T\d{6}Z\.dump|config-\d{8}T\d{6}Z\.tar\.gz)', re.ASCII)
HASH = re.compile(r'[a-f0-9]{64}', re.ASCII)
ATTEMPTS = 3
COMMAND_TIMEOUT = 240
MANIFEST_INVALID = b'school21-offsite-manifest-invalid'

# One remote process reads the small checksum sidecars and archive metadata. It
# never reads archive contents and performs no writes on the VM. O_NOFOLLOW and
# fstat protect the snapshot from symlinks and non-regular files, including races.
REMOTE_MANIFEST_SCRIPT = ('ROOT = ' + repr(REMOTE) + '\n' + r'''
import json
import os
import re
import stat
import sys

name_pattern = re.compile(r'(?:pool-\d{8}T\d{6}Z\.dump|config-\d{8}T\d{6}Z\.tar\.gz)', re.ASCII)
checksum_pattern = re.compile(r'([a-f0-9]{64})(?:[ \t]+\*?(.+))?', re.ASCII)

def open_regular(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    if not stat.S_ISREG(os.fstat(fd).st_mode):
        os.close(fd)
        raise ValueError()
    return fd

try:
    entries = {entry.name: entry for entry in os.scandir(ROOT)}
    archives = []
    for name, entry in sorted(entries.items()):
        base = name[:-7] if name.endswith('.sha256') else name
        if name_pattern.fullmatch(base) and entry.is_symlink():
            raise ValueError()
    for name in sorted(entries):
        if not name_pattern.fullmatch(name) or name + '.sha256' not in entries:
            continue
        try:
            archive_fd = open_regular(os.path.join(ROOT, name))
            try:
                size = os.fstat(archive_fd).st_size
            finally:
                os.close(archive_fd)
            checksum_fd = open_regular(os.path.join(ROOT, name + '.sha256'))
            with os.fdopen(checksum_fd, 'rb') as stream:
                checksum_text = stream.read(4097).decode('ascii').rstrip('\n')
        except FileNotFoundError:
            # An archive without its completed sidecar is not a published backup.
            continue
        match = checksum_pattern.fullmatch(checksum_text)
        if size <= 0 or len(checksum_text) > 4096 or not match:
            raise ValueError()
        if match.group(2) not in (None, name, os.path.join(ROOT, name)):
            raise ValueError()
        archives.append({'name': name, 'sha256': match.group(1), 'size': size})
    print(json.dumps({'version': 1, 'archives': archives}, separators=(',', ':')))
except Exception:
    print('school21-offsite-manifest-invalid', file=sys.stderr)
    sys.exit(2)
''').encode('utf-8')


class BackupFailure(Exception):
    """Only fixed phase/category codes may reach the user-facing error log."""

    def __init__(self, phase, category):
        self.phase = phase
        self.category = category
        super().__init__(phase + '/' + category)


def _ssh_failure(stderr):
    text = (stderr or b'').decode('utf-8', errors='replace').lower()
    if 'permission denied' in text or 'authentication failed' in text:
        return 'authentication', False
    if ('host key verification failed' in text
            or 'remote host identification has changed' in text
            or 'host key has changed' in text):
        return 'host-key', False
    if MANIFEST_INVALID.decode('ascii') in text:
        return 'invalid-manifest', False
    transient = ('connection timed out', 'operation timed out', 'connection reset',
                 'connection closed', 'connection aborted', 'broken pipe')
    if any(marker in text for marker in transient):
        return 'connection', True
    return 'command', False


def command(args, phase, input_data=None):
    for attempt in range(ATTEMPTS):
        try:
            return subprocess.run(args, check=True, capture_output=True,
                                  timeout=COMMAND_TIMEOUT, input=input_data).stdout
        except subprocess.TimeoutExpired as error:
            category, retry = _ssh_failure(error.stderr)
            if category not in ('authentication', 'host-key', 'invalid-manifest'):
                category, retry = 'timeout', True
        except subprocess.CalledProcessError as error:
            category, retry = _ssh_failure(error.stderr)
        except OSError:
            raise BackupFailure(phase, 'command') from None
        if not retry or attempt == ATTEMPTS - 1:
            raise BackupFailure(phase, category) from None
        time.sleep(2 ** attempt)


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError()
        result[key] = value
    return result


def parse_manifest(payload):
    try:
        manifest = json.loads(payload, object_pairs_hook=_unique_object)
        if (not isinstance(manifest, dict) or set(manifest) != {'version', 'archives'}
                or type(manifest['version']) is not int or manifest['version'] != 1
                or not isinstance(manifest['archives'], list) or not manifest['archives']):
            raise ValueError()
        names = set()
        for archive in manifest['archives']:
            if not isinstance(archive, dict) or set(archive) != {'name', 'sha256', 'size'}:
                raise ValueError()
            name, checksum, size = archive['name'], archive['sha256'], archive['size']
            if (not isinstance(name, str) or not NAME.fullmatch(name) or name in names
                    or not isinstance(checksum, str) or not HASH.fullmatch(checksum)
                    or type(size) is not int or size <= 0):
                raise ValueError()
            names.add(name)
        return sorted(manifest['archives'], key=lambda archive: archive['name'])
    except (ValueError, TypeError, UnicodeError, RecursionError):
        raise BackupFailure('manifest', 'invalid-manifest') from None


def regular_file(path):
    try:
        info = path.lstat()
    except FileNotFoundError:
        return None
    if not stat.S_ISREG(info.st_mode):
        raise BackupFailure('local', 'unsafe-file')
    return info


def digest(path):
    result = hashlib.sha256()
    fd = os.open(str(path), os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
            raise BackupFailure('local', 'unsafe-file')
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def atomic_text(path, text):
    regular_file(path)
    fd, temporary_name = tempfile.mkstemp(prefix='.metadata-', dir=str(path.parent))
    temporary = Path(temporary_name)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.chmod(0o600)
        regular_file(path)
        os.replace(str(temporary), str(path))
    finally:
        if temporary.exists():
            temporary.unlink()


def preserve_previous(target):
    # A hardlink preserves the old inode while os.replace keeps the public
    # archive name present and switches it atomically to the verified download.
    for attempt in range(10):
        previous = target.with_name(target.name + '.previous-' + uuid.uuid4().hex)
        try:
            os.link(str(target), str(previous), follow_symlinks=False)
            return
        except FileExistsError:
            continue
    raise BackupFailure('local', 'preserve')


def _sync_locked(destination):
    payload = command(['/usr/bin/ssh', *OPTIONS, HOST, 'python3 -'],
                      'manifest', REMOTE_MANIFEST_SCRIPT)
    archives = parse_manifest(payload)
    # Validate every local pathname before altering any archives or success marker.
    for archive in archives:
        regular_file(destination / archive['name'])
        regular_file(destination / (archive['name'] + '.sha256'))
    regular_file(destination / 'last-success.txt')
    downloaded = 0
    for archive in archives:
        name, checksum, size = archive['name'], archive['sha256'], archive['size']
        target = destination / name
        existing = regular_file(target)
        verified = existing and existing.st_size == size and digest(target) == checksum
        if verified:
            target.chmod(0o600)
        else:
            with tempfile.TemporaryDirectory(prefix='.download-', dir=str(destination)) as directory:
                temporary = Path(directory) / name
                command(['/usr/bin/scp', *OPTIONS, HOST + ':' + REMOTE + '/' + name,
                         str(temporary)], 'download')
                info = regular_file(temporary)
                if not info or info.st_size != size or digest(temporary) != checksum:
                    raise BackupFailure('verification', 'checksum')
                temporary.chmod(0o600)
                if regular_file(target):
                    target.chmod(0o600)
                    preserve_previous(target)
                os.replace(str(temporary), str(target))
            downloaded += 1
        atomic_text(destination / (name + '.sha256'), checksum + '  ' + name + '\n')
    atomic_text(destination / 'last-success.txt',
                datetime.datetime.now().astimezone().isoformat() + '\n')
    return downloaded


def sync_backups(destination=DEST):
    destination = Path(destination)
    previous_umask = os.umask(0o077)
    try:
        if destination.is_symlink():
            raise BackupFailure('local', 'unsafe-directory')
        destination.mkdir(parents=True, exist_ok=True, mode=0o700)
        if not stat.S_ISDIR(destination.lstat().st_mode):
            raise BackupFailure('local', 'unsafe-directory')
        destination.chmod(0o700)
        lock_path = destination / '.download.lock'
        regular_file(lock_path)
        lock_fd = os.open(str(lock_path), os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        with os.fdopen(lock_fd, 'a') as lock:
            if not stat.S_ISREG(os.fstat(lock.fileno()).st_mode):
                raise BackupFailure('local', 'unsafe-file')
            os.fchmod(lock.fileno(), 0o600)
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                return None
            return _sync_locked(destination)
    except OSError:
        raise BackupFailure('local', 'filesystem') from None
    finally:
        os.umask(previous_umask)


def main():
    try:
        downloaded = sync_backups()
    except BackupFailure as error:
        print('Backup sync failed; phase=' + error.phase + '; category=' + error.category,
              flush=True)
        return 1
    except Exception:
        print('Backup sync failed; phase=sync; category=unexpected', flush=True)
        return 1
    if downloaded is not None:
        print('Backup sync successful; downloaded archives:', downloaded, flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
