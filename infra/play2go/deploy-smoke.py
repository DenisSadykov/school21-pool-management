"""Read-only checks, using an in-memory token rather than a stored password."""
import json
import sys
import urllib.request
from app import app, db, User, make_token

try:
    with app.app_context():
        if 'readonly' in sys.argv:
            assert db.session.execute(db.text('SHOW default_transaction_read_only')).scalar() == 'on'
        user = User.query.filter_by(role='admin', active=True).first()
        if user is None:
            raise RuntimeError('No active admin')
        token = make_token(user)
    for route in (
        '/api/health', '/api/auth/me', '/api/pools/active', '/api/dashboard',
        '/api/schedule', '/api/volunteers', '/api/students', '/api/tribes',
        '/api/tribe-events', '/api/penalties', '/api/notifications/overview',
    ):
        request = urllib.request.Request(
            'http://127.0.0.1:5000' + route,
            headers={'Authorization': 'Bearer ' + token},
        )
        with urllib.request.urlopen(request, timeout=15) as response:
            payload = json.load(response)
            if route == '/api/health':
                assert payload['status'] == 'ok'
    print('Read-only application checks passed')
except Exception:
    raise SystemExit('Application checks failed; private details omitted')
