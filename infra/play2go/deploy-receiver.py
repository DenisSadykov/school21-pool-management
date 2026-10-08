#!/usr/bin/python3
"""Root-owned forced SSH command: receive a bounded release, not a shell command.

Only application code and built frontend are replaced. Host config, credentials,
database volumes and schema migrations are deliberately outside this protocol.
"""
import fcntl
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import signal
import subprocess
import sys
import tarfile
import time

ROOT = Path('/opt/school21-pool-copy')
RELEASES = ROOT / 'releases'
SMOKE = Path('/usr/local/lib/school21-deploy-smoke.py')
COMPOSE = ['bash', str(ROOT / 'infra/play2go/compose-live.sh')]
BACKEND = 'school21-pool-copy-backend-1'
IMAGE = 'school21-pool-copy-backend'
TIMERS = ['pool-notifications.timer', 'pool-sheets.timer']


def run(args, **kwargs):
    return subprocess.run(args, check=True, timeout=600, **kwargs)


def output(args):
    return run(args, capture_output=True, text=True).stdout.strip()


def switch_frontend(target):
    link = ROOT / 'frontend/build'
    temporary = ROOT / 'frontend/build.next'
    temporary.unlink(missing_ok=True)
    temporary.symlink_to(target, target_is_directory=True)
    if link.exists() and not link.is_symlink():
        link.rename(RELEASES / ('original-frontend-' + str(time.time_ns())))
    os.replace(temporary, link)


def healthy(container):
    for _ in range(45):
        state = output(['docker', 'inspect', container, '--format', '{{.State.Health.Status}}'])
        if state == 'healthy':
            return
        if state == 'unhealthy':
            break
        time.sleep(2)
    raise RuntimeError('Container health check failed')


def smoke(container, readonly=False):
    args = ['docker', 'exec', '-i', container, 'python', '-']
    if readonly:
        args.append('readonly')
    run(args, input=SMOKE.read_bytes())


def unpack(data, target):
    total = 0
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
        for member in archive:
            path = PurePosixPath(member.name)
            parts = path.parts
            if path.is_absolute() or '..' in parts or not parts:
                raise ValueError('Invalid archive path')
            allowed = parts[0] == 'backend' or parts[:2] == ('frontend', 'build')
            if not allowed or any(p.startswith('.env') or p in {'.git', '.venv', 'venv', '__pycache__', 'google_key.json'} for p in parts):
                raise ValueError('Unexpected archive file')
            if not (member.isfile() or member.isdir()):
                raise ValueError('Links and special files are prohibited')
            total += member.size
            if total > 150 * 1024 * 1024:
                raise ValueError('Archive expands beyond limit')
            destination = target.joinpath(*parts)
            if member.isdir():
                destination.mkdir(parents=True, exist_ok=True)
            else:
                destination.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(member) as source, destination.open('wb') as sink:
                    shutil.copyfileobj(source, sink)
                destination.chmod(0o644)
    for expected in ['backend/app.py', 'backend/requirements.txt', 'frontend/build/index.html']:
        if not (target / expected).is_file():
            raise ValueError('Incomplete application release')


def main():
    os.umask(0o077)
    RELEASES.mkdir(mode=0o700, exist_ok=True)
    lock = (ROOT / 'secure/deploy.lock').open('a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    sha = sys.stdin.buffer.readline(100).decode().strip()
    if not re.fullmatch(r'[0-9a-f]{40}', sha):
        raise ValueError('Invalid commit identifier')
    data = sys.stdin.buffer.read(50 * 1024 * 1024 + 1)
    if len(data) > 50 * 1024 * 1024:
        raise ValueError('Archive exceeds upload limit')
    release = RELEASES / (sha + '-' + str(time.time_ns()))
    release.mkdir(mode=0o700)
    unpack(data, release)
    candidate = 'pool-deploy-candidate-' + sha[:12]
    env_path = release / 'candidate.env'
    old_image = output(['docker', 'inspect', BACKEND, '--format', '{{.Image}}'])
    old_frontend = (ROOT / 'frontend/build').resolve()
    if not (ROOT / 'frontend/build').is_symlink():
        old_frontend = RELEASES / ('legacy-frontend-' + str(time.time_ns()))
        shutil.copytree(ROOT / 'frontend/build', old_frontend)
    active_timers = [t for t in TIMERS if subprocess.run(['systemctl', 'is-active', '--quiet', t]).returncode == 0]
    activated = False
    stopped_timers = False
    image = IMAGE + ':' + sha
    try:
        run(['docker', 'build', '-f', str(ROOT / 'infra/play2go/Dockerfile.api'), '-t', image, str(release)])
        config = json.loads(output(['docker', 'inspect', BACKEND]))[0]['Config']['Env']
        config = [entry for entry in config if not entry.startswith('PGOPTIONS=')]
        config.append('PGOPTIONS=-c default_transaction_read_only=on')
        env_path.write_text('\n'.join(config) + '\n')
        env_path.chmod(0o600)
        run(['docker', 'run', '-d', '--name', candidate,
             '--network', 'school21-pool-copy_database', '--memory', '384m',
             '--env-file', str(env_path), '--health-cmd',
             'python -c "import urllib.request; urllib.request.urlopen(\'http://127.0.0.1:5000/api/health\', timeout=5)"',
             '--health-interval', '2s', '--health-retries', '15', image], stdout=subprocess.DEVNULL)
        healthy(candidate)
        smoke(candidate, readonly=True)
        run(['systemctl', 'start', 'pool-copy-backup.service'])
        if active_timers:
            stopped_timers = True
            run(['systemctl', 'stop', *active_timers, 'pool-notifications.service', 'pool-sheets.service'])
        activated = True
        run(['docker', 'tag', image, IMAGE + ':latest'])
        # Existing nginx bind mount keeps serving its previous inode until recreation.
        switch_frontend(release / 'frontend/build')
        run(COMPOSE + ['up', '-d', '--no-build', '--no-deps', '--force-recreate', 'backend', 'web'])
        healthy(BACKEND)
        smoke(BACKEND)
        run(['curl', '-fsS', '--max-time', '20', 'https://school21pool.ru/api/health'], stdout=subprocess.DEVNULL)
        run(['curl', '-fsS', '--max-time', '20', 'https://school21pool.ru/login'], stdout=subprocess.DEVNULL)
        (ROOT / 'secure/deployed-commit.txt').write_text(sha + '\n')
        print('Production release verified: ' + sha, flush=True)
    except BaseException:
        if activated:
            print('Verification failed; restoring previous application, keeping database', flush=True)
            run(['docker', 'tag', old_image, IMAGE + ':latest'])
            switch_frontend(old_frontend)
            run(COMPOSE + ['up', '-d', '--no-build', '--no-deps', '--force-recreate', 'backend', 'web'])
            healthy(BACKEND)
            smoke(BACKEND)
            print('Previous application restored', flush=True)
        raise
    finally:
        env_path.unlink(missing_ok=True)
        subprocess.run(['docker', 'rm', '-f', candidate], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if stopped_timers:
            run(['systemctl', 'start', *active_timers])


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(RuntimeError('Deployment interrupted')))
    signal.signal(signal.SIGHUP, lambda *_: (_ for _ in ()).throw(RuntimeError('Connection interrupted')))
    try:
        main()
    except BaseException:
        print('Deployment failed; private error details omitted', file=sys.stderr)
        sys.exit(1)
