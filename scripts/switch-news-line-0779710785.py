#!/usr/bin/env python3
"""Move the existing news uploader to the owner-selected line, preserving live code."""
import email
import json
import os
import re
import subprocess
import tempfile
import urllib.request
from pathlib import Path

API = "https://api.cloudflare.com/client/v4/accounts/7c5ecc8cc6dc99838cfbf1b3a1086b74/workers/scripts/election-news-ivr"
TOKEN = os.environ["CLOUDFLARE_API_TOKEN"]
TARGET = "0779710785"

def call(path, data=None, content_type=None):
    headers = {"Authorization": "Bearer " + TOKEN}
    if content_type:
        headers["Content-Type"] = content_type
    request = urllib.request.Request(API + path, data=data, headers=headers,
                                     method="PUT" if data is not None else "GET")
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.headers.get("Content-Type", ""), response.read()

content_type, raw = call("/content/v2")
if "multipart" in content_type:
    message = email.message_from_bytes(b"Content-Type: " + content_type.encode() + b"\r\n\r\n" + raw)
    modules = [(part.get_param("name", header="content-disposition") or part.get_filename(),
                part.get_content_type(), part.get_payload(decode=True))
               for part in message.walk() if not part.is_multipart()]
else:
    modules = [("worker.js", "application/javascript+module", raw)]
pattern = r"""((?:const|let|var)\s+ACTIVE_NEWS_LINE\s*=\s*['"])0737061119(['"])"""
changed = 0
patched = []
for name, mime, payload in modules:
    if name and name.endswith((".js", ".mjs")):
        code, count = re.subn(pattern, lambda match: match[1] + TARGET + match[2], payload.decode())
        changed += count
        payload = code.encode()
        if count:
            with tempfile.TemporaryDirectory() as folder:
                path = Path(folder) / "worker.mjs"
                path.write_text(code)
                subprocess.run(["node", "--check", str(path)], check=True)
    patched.append((name, mime, payload))
if changed != 1:
    raise SystemExit("Expected exactly one old line guard; no deployment performed")
_, raw_settings = call("/settings")
settings_response = json.loads(raw_settings)
if not settings_response.get("success"):
    raise SystemExit("Could not read worker settings")
settings = settings_response["result"]
main_module = settings.get("main_module")
if not main_module:
    javascript = [name for name, _, _ in patched if name and name.endswith((".js", ".mjs"))]
    if len(javascript) != 1:
        raise SystemExit("Cannot safely determine main module")
    main_module = javascript[0]
metadata = {
    "main_module": main_module,
    "compatibility_date": settings["compatibility_date"],
    "compatibility_flags": settings.get("compatibility_flags") or [],
    "keep_bindings": ["plain_text", "secret_text", "json", "kv_namespace", "ai", "d1", "r2_bucket",
                      "service", "queue", "durable_object_namespace", "analytics_engine",
                      "browser", "vectorize", "hyperdrive", "version_metadata", "send_email"]
}
if settings.get("usage_model"):
    metadata["usage_model"] = settings["usage_model"]
boundary = "news-line-migration"
parts = [("metadata", "application/json", json.dumps(metadata).encode())] + patched
body = b""
for name, mime, payload in parts:
    body += ("--" + boundary + '\r\nContent-Disposition: form-data; name="' + name +
             '"; filename="' + name + '"\r\nContent-Type: ' + mime + "\r\n\r\n").encode()
    body += payload + b"\r\n"
body += ("--" + boundary + "--\r\n").encode()
_, response = call("", body, "multipart/form-data; boundary=" + boundary)
if not json.loads(response).get("success"):
    raise SystemExit("Cloudflare rejected deployment")
_, live = call("/content/v2")
if TARGET.encode() not in live:
    raise SystemExit("Deployed target could not be verified")
print("News line guard deployed for " + TARGET)
