"""Scheduled delivery on the VM, without exposing credentials in arguments."""
import json
import os
import sys
import urllib.request

route = (
    '/api/internal/google-sheets/export'
    if len(sys.argv) > 1 and sys.argv[1] == 'google-sheets'
    else '/api/notifications/dispatch?limit=50'
)
request = urllib.request.Request(
    'http://127.0.0.1:5000' + route,
    data=b'{}',
    headers={
        'Authorization': 'Bearer ' + os.environ['INTERNAL_API_SECRET'],
        'Content-Type': 'application/json',
    },
)
try:
    with urllib.request.urlopen(request, timeout=180) as response:
        result = json.load(response)
    if not result.get('ok') or result.get('failed'):
        raise RuntimeError('Dispatch failed')
    print('Dispatch completed')
except Exception:
    raise SystemExit('Dispatch failed; private error details omitted')
