# Mail Plus — Gmail HTTP add-on on Cloudflare

Backend deployed: https://mail-plus-gmail.smwlyqswkwt232.workers.dev
Deployment ID: fd90030b9fdd47f08e9d06da244fba2f

## Status
Cloudflare backend deployed; Google registration and installation are NOT complete.
Until ADDON_CLIENT_ID and ADDON_SERVICE_ACCOUNT are configured, all action endpoints fail closed (503).
GET /health exposes only service/version/setup status. No email content or tokens are logged or persisted.

## Features
Hebrew Gmail sidebar cards; add/complete personal cloud tasks; create a follow-up from the current message subject; acknowledgement template for manual copying; link to existing full Mail Plus web app.
Tasks in gmail_addon_tasks are separate from existing web-app tasks. No AI generation or automatic draft insertion in this first HTTP version.
Only current-message metadata is requested, not whole mailbox access. No email sending.

## Finish Google registration
1. In Google Cloud project yemot-admin, enable Google Workspace Marketplace SDK and Google Workspace add-ons API.
2. Configure OAuth consent as needed. In Workspace Marketplace SDK > HTTP Deployments create mail-plus-cloudflare using deployment.json.
3. From Authorization Resource copy OAuth Client ID and Service Account Email. These are identifiers, not secrets.
4. Set Cloudflare Worker plain-text vars ADDON_CLIENT_ID and ADDON_SERVICE_ACCOUNT to those exact values.
5. Install the test deployment into the intended Google account and authorize it. Reload Gmail; verify home, add/complete task, message follow-up and compose template.
Do not substitute the existing web app client ID; use the HTTP deployment authorization resource.
Backend verifies service account JWT signature, endpoint audience and email, plus end-user JWT signature/client audience and owner allowlist.
Google registration must be completed before advertising the addon as installed.

## Worker
Upload worker.mjs and auth.mjs as ES modules, main_module worker.mjs, compatibility date 2026-11-14.
D1 binding DB: 55626022-0bb9-408c-8622-9bd5ba2142fa.
Keep preview URLs disabled.
Schema: CREATE TABLE IF NOT EXISTS gmail_addon_tasks (id TEXT PRIMARY KEY, owner TEXT NOT NULL, title TEXT NOT NULL, created INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS gmail_addon_tasks_owner ON gmail_addon_tasks(owner,done,created);
Tests: node test.mjs (Node 22+).
