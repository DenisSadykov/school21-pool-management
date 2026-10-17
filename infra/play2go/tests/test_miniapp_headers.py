from pathlib import Path


def test_telegram_embedding_is_scoped_to_miniapp_only():
    source = (Path(__file__).parents[1] / 'nginx.conf').read_text()
    prefix, miniapp = source.split('location = /miniapp/penalties {', 1)
    miniapp = miniapp.split('\n    }', 1)[0]
    assert 'X-Frame-Options DENY' in prefix
    assert "frame-ancestors 'none'" in prefix
    assert 'X-Frame-Options' not in miniapp
    assert "script-src 'self' https://telegram.org" in miniapp
    assert 'frame-ancestors https://web.telegram.org https://*.web.telegram.org;' in miniapp
    assert 'Cache-Control "no-store"' in miniapp


def test_platform_can_open_in_telegram_without_unframing_regular_site():
    source = (Path(__file__).parents[1] / 'nginx.conf').read_text()
    embedded = source.split('location = /miniapp/platform {', 1)[1].split('\n    }', 1)[0]
    assert 'X-Frame-Options' not in embedded
    assert 'frame-ancestors https://web.telegram.org https://*.web.telegram.org;' in embedded
    assert "script-src 'self';" in embedded
    assert 'Cache-Control "no-store"' in embedded
    assert 'X-Frame-Options DENY' in source.split('location /api/', 1)[0]
