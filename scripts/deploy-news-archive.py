#!/usr/bin/env python3
"""Patch only the existing mail bridge using the repository's Cloudflare credential."""
import email
import json
import os
from pathlib import Path
import subprocess
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
API = 'https://api.cloudflare.com/client/v4/accounts/7c5ecc8cc6dc99838cfbf1b3a1086b74/workers/scripts/yemot-mail'
TOKEN = os.environ.get('CLOUDFLARE_API_TOKEN', '')
if not TOKEN:
    raise SystemExit('Cloudflare deployment credential missing')


def call(path, data=None, content_type=None):
    headers = {'Authorization': 'Bearer ' + TOKEN}
    if content_type:
        headers['Content-Type'] = content_type
    with urllib.request.urlopen(urllib.request.Request(API + path, data=data, headers=headers, method='PUT' if data is not None else 'GET'), timeout=90) as response:
        return response.headers.get('Content-Type', ''), response.read()


content_type, raw = call('/content/v2')
if 'multipart' in content_type:
    message = email.message_from_bytes(b'Content-Type: ' + content_type.encode() + b'\r\n\r\n' + raw)
    scripts = [p.get_payload(decode=True) for p in message.walk() if (p.get_param('name', header='content-disposition') or p.get_filename() or '').endswith(('.js', '.mjs'))]
    if len(scripts) != 1:
        raise SystemExit('Refusing deployment: expected one existing JavaScript module')
    raw = scripts[0]
code = raw.decode('utf-8')
marker = 'const newsVideoAuth='
if code.count(marker) != 1 or code.count('const originalMailWorker = {') != 1:
    raise SystemExit('Existing mail bridge structure changed; deployment stopped')
folder = ROOT / 'live/mail'
folder.mkdir(parents=True, exist_ok=True)
(folder / 'base.mjs').write_text(code.split(marker, 1)[0].replace('const originalMailWorker = {', 'export default {', 1))
subprocess.run(['python', str(ROOT / 'scripts/build-mail-video.py')], check=True)
worker = folder / 'worker.generated.mjs'
subprocess.run(['node', '--check', str(worker)], check=True)
assert 'sendMail:false' in worker.read_text()
_, raw_settings = call('/settings')
settings_result = json.loads(raw_settings)
if not settings_result.get('success'):
    raise SystemExit('Could not read current worker settings')
settings = settings_result['result']
metadata = {'main_module': 'worker.js', 'compatibility_date': settings.get('compatibility_date') or '2025-09-01',
            'compatibility_flags': settings.get('compatibility_flags') or [],
            'keep_bindings': ['plain_text', 'secret_text', 'json', 'kv_namespace', 'ai', 'd1', 'r2_bucket', 'service', 'queue', 'durable_object_namespace', 'analytics_engine', 'browser', 'vectorize', 'hyperdrive', 'version_metadata', 'send_email']}
if settings.get('usage_model'):
    metadata['usage_model'] = settings['usage_model']
boundary = 'news-archive-deployment'
body = b''
for name, mime, payload in [('metadata', 'application/json', json.dumps(metadata).encode()), ('worker.js', 'application/javascript+module', worker.read_bytes())]:
    body += ('--' + boundary + '\r\nContent-Disposition: form-data; name="' + name + '"; filename="' + name + '"\r\nContent-Type: ' + mime + '\r\n\r\n').encode() + payload + b'\r\n'
body += ('--' + boundary + '--\r\n').encode()
_, response = call('', body, 'multipart/form-data; boundary=' + boundary)
result = json.loads(response)
if not result.get('success'):
    raise SystemExit('Cloudflare deployment rejected')
_, deployed = call('/content/v2')
if b'/news-video/backfill' not in deployed or b'sendMail:false' not in deployed:
    raise SystemExit('Deployed archive code could not be confirmed')
print('Drive-only archive bridge deployed and verified')
