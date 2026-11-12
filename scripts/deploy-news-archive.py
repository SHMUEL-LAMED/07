#!/usr/bin/env python3
"""Patch only the existing mail bridge using the repository's Cloudflare credential."""
import email
import json
import os
import posixpath
import re
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
        return response.headers, response.read()


def is_js(name):
    return bool(name) and name.endswith(('.js', '.mjs'))


def split_modules(content_type, raw):
    """Every live module as (name, mime, bytes); the worker may be one file or several."""
    if 'multipart' not in content_type:
        return [('worker.js', 'application/javascript+module', raw)]
    message = email.message_from_bytes(b'Content-Type: ' + content_type.encode() + b'\r\n\r\n' + raw)
    return [(part.get_param('name', header='content-disposition') or part.get_filename(), part.get_content_type(), part.get_payload(decode=True))
            for part in message.walk() if not part.is_multipart()]


def find_mail_module(modules):
    """The one module holding the mail line itself: the Google helpers the bridge calls are in its scope."""
    helpers = ('accessToken', 'gapi', 'driveFolder', 'driveUpload')

    def in_scope(code, name):
        # Defined in the module, or imported into it since the line was split into lib/ modules.
        return bool(re.search(r'async function %s\(|import\s*\{[^}]*\b%s\b[^}]*\}\s*from' % (name, name), code))

    found = []
    for index, (name, _, payload) in enumerate(modules):
        if not is_js(name):
            continue
        code = payload.decode('utf-8')
        if code.count(MARKER) == 1 or (code.count('export default {') == 1 and all(in_scope(code, helper) for helper in helpers)):
            found.append(index)
    if len(found) != 1:
        raise SystemExit('Refusing deployment: expected exactly one mail module with the Google helpers')
    return found[0]


def clean_base(code):
    """The mail module without any earlier copy of the bridge."""
    patched = code.count(MARKER)
    if patched == 0:
        if code.count('export default {') != 1 or 'originalMailWorker' in code:
            raise SystemExit('Existing mail module structure changed; deployment stopped')
        return code
    if patched != 1 or code.count('const originalMailWorker = {') != 1:
        raise SystemExit('Existing mail bridge structure changed; deployment stopped')
    base = code.split(MARKER, 1)[0]
    # Remove the known pre-auth maintenance prelude emitted by the initial rollout.
    base = base.split('// Authenticated, one-time replacement limited to the five owner-selected videos.', 1)[0]
    return base.replace('const originalMailWorker = {', 'export default {', 1).rstrip('\n') + '\n'


def find_main_module(headers, modules):
    """Cloudflare names the entry point in a header; otherwise it is the module nobody imports."""
    names = [name for name, _, _ in modules if is_js(name)]
    declared = headers.get('cf-entrypoint', '')
    if declared in names:
        return declared
    if len(names) == 1:
        return names[0]
    imported = set()
    for importer, _, payload in [m for m in modules if is_js(m[0])]:
        # Module names are paths (lib/google.js), and a specifier is relative to the importing module.
        for target in re.findall(r"""(?:from|import)\s*\(?\s*['"](\.{1,2}/[^'"]+)['"]""", payload.decode('utf-8')):
            imported.add(posixpath.normpath(posixpath.join(posixpath.dirname(importer), target)))
    roots = [name for name in names if name not in imported]
    if len(roots) != 1:
        raise SystemExit('Cannot safely determine the main module; deployment stopped')
    return roots[0]


MARKER = 'const newsVideoAuth='
live_headers, raw = call('/content/v2')
modules = split_modules(live_headers.get('Content-Type', ''), raw)
mail_index = find_mail_module(modules)
main_module = find_main_module(live_headers, modules)
base = clean_base(modules[mail_index][2].decode('utf-8'))
folder = ROOT / 'live/mail'
folder.mkdir(parents=True, exist_ok=True)
(folder / 'base.mjs').write_text(base)
subprocess.run(['python', str(ROOT / 'scripts/build-mail-video.py')], check=True)
worker = folder / 'worker.generated.mjs'
subprocess.run(['node', '--check', str(worker)], check=True)
assert 'sendMail:false' in worker.read_text()
_, raw_settings = call('/settings')
settings_result = json.loads(raw_settings)
if not settings_result.get('success'):
    raise SystemExit('Could not read current worker settings')
settings = settings_result['result']
metadata = {'main_module': main_module, 'compatibility_date': settings.get('compatibility_date') or '2025-09-01',
            'compatibility_flags': settings.get('compatibility_flags') or [],
            'keep_bindings': ['plain_text', 'secret_text', 'json', 'kv_namespace', 'ai', 'd1', 'r2_bucket', 'service', 'queue', 'durable_object_namespace', 'analytics_engine', 'browser', 'vectorize', 'hyperdrive', 'version_metadata', 'send_email']}
if settings.get('usage_model'):
    metadata['usage_model'] = settings['usage_model']
boundary = 'news-archive-deployment'
body = b''
modules[mail_index] = (modules[mail_index][0], modules[mail_index][1], worker.read_bytes())
for name, mime, payload in [('metadata', 'application/json', json.dumps(metadata).encode())] + modules:
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
