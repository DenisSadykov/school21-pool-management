from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def test_deploy_and_backup_use_replacement_server():
    workflow = (ROOT / '.github/workflows/ci.yml').read_text()
    offsite = (ROOT / 'infra/play2go/offsite-backup.py').read_text()
    assert 'pool-deploy@2.26.84.18' in workflow
    assert 'pool-deploy@31.77.148.136' not in workflow
    assert 'KexAlgorithms=curve25519-sha256' in workflow
    assert 'IdentitiesOnly=yes' in workflow
    assert 'StrictHostKeyChecking=yes' in workflow
    assert "HOST = 'root@2.26.84.18'" in offsite
    assert 'StrictHostKeyChecking=yes' in offsite
    assert 'known_hosts_school21_pool' in offsite
    assert 'UseKeychain=yes' in offsite


def test_server_backup_always_uses_live_compose_wrapper():
    script = (ROOT / 'infra/play2go/backup.sh').read_text()
    assert 'infra/play2go/compose-live.sh' in script
    assert 'docker compose -f' not in script
    assert script.count('bash "$task_compose" exec') == 3
