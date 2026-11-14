#!/usr/bin/env python3
"""Upload election-news/*.mjs to the election-news-ivr Worker, keeping its bindings and secrets.
Refuses if the live worker.mjs is not the version reviewed before this change (guards against overwriting live edits)."""
import email, hashlib, json, os, sys, urllib.request
from pathlib import Path

API = 'https://api.cloudflare.com/client/v4/accounts/7c5ecc8cc6dc99838cfbf1b3a1086b74/workers/scripts/election-news-ivr'
TOKEN = os.environ.get('CLOUDFLARE_API_TOKEN') or sys.exit('Cloudflare deployment credential missing')
ROOT = Path(__file__).resolve().parent.parent / 'election-news'
MODULES = ['collector-auth.mjs', 'poll-folder.mjs', 'source-feed.mjs', 'worker.mjs']
# Live worker.mjs reviewed on 2026-11-14 (live-only modesty filter); also accept the repo version for re-runs.
EXPECTED_LIVE = {'e9afb0e6661959e6b2326078180f926f0dbe779d69c4b2d4e17f1f3006471ea4',
                 hashlib.sha256((ROOT / 'worker.mjs').read_bytes()).hexdigest()}

def call(path='', data=None, content_type=None):
    headers = {'Authorization': 'Bearer ' + TOKEN}
    if content_type: headers['Content-Type'] = content_type
    req = urllib.request.Request(API + path, data=data, headers=headers, method='PUT' if data is not None else 'GET')
    with urllib.request.urlopen(req, timeout=90) as r: return r.headers.get('Content-Type', ''), r.read()

def live_modules():
    ctype, raw = call('/content/v2')
    msg = email.message_from_bytes(b'Content-Type: ' + ctype.encode() + b'\r\n\r\n' + raw)
    return {p.get_param('name', header='content-disposition'): p.get_payload(decode=True) for p in msg.walk() if not p.is_multipart()}

live = live_modules()
if set(live) != set(MODULES): sys.exit('Refusing: live modules differ: %s' % sorted(live))
if hashlib.sha256(live['worker.mjs']).hexdigest() not in EXPECTED_LIVE: sys.exit('Refusing: live worker.mjs changed since review')
settings = json.loads(call('/settings')[1])['result']
metadata = {'main_module': 'worker.mjs', 'compatibility_date': settings['compatibility_date'],
            'compatibility_flags': settings.get('compatibility_flags') or [],
            'keep_bindings': ['plain_text', 'secret_text', 'json', 'kv_namespace', 'd1', 'r2_bucket', 'service', 'ai']}
boundary = 'election-news-deploy'
body = b''
for name, mime, payload in [('metadata', 'application/json', json.dumps(metadata).encode())] + [(m, 'application/javascript+module', (ROOT / m).read_bytes()) for m in MODULES]:
    body += ('--%s\r\nContent-Disposition: form-data; name="%s"; filename="%s"\r\nContent-Type: %s\r\n\r\n' % (boundary, name, name, mime)).encode() + payload + b'\r\n'
body += ('--%s--\r\n' % boundary).encode()
if not json.loads(call('', body, 'multipart/form-data; boundary=' + boundary)[1]).get('success'): sys.exit('Cloudflare rejected deployment')
after = live_modules()
if any(after.get(m) != (ROOT / m).read_bytes() for m in MODULES): sys.exit('Deployed code could not be verified')
names = {b['name'] for b in json.loads(call('/settings')[1])['result']['bindings']}
missing = {'DB', 'ADMIN_TOKEN', 'YEMOT_TOKEN', 'SOURCE_HOOK_TOKEN', 'YEMOT_TOKEN_SECONDARY', 'COLLECTOR_REPO', 'COLLECTOR_REPO_ID'} - names
if missing: sys.exit('Bindings missing after deploy: %s' % sorted(missing))
print('election-news-ivr deployed and verified:', hashlib.sha256((ROOT / 'worker.mjs').read_bytes()).hexdigest()[:16])
