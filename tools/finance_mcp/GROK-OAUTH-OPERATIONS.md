# Grok OAuth operations contract

Local candidate only. No commit, push, credential issuance, production edit or
deployment is performed in this coding pass. Apply infrastructure changes only
after orchestrator review and a separately verified rollback. Published Grok
metadata is evidence for the client configuration; an actual Grok authorization
and tool-call round trip remains unverified. Never broaden redirects to fix a
failed Grok test.

## Fixed access and process boundary

- Client ID / CIMD URL: `https://grok.com/oauth/mcp-client.json`.
- Only callback: `https://grok.com/connectors-oauth-exchange-code/` (exact trailing
  slash). The console.x.ai callback is not permitted by this web-only server.
- Public client, authorization code + PKCE S256; no secret, registration endpoint,
  refresh token, refresh grant or automatic renewal. Discovery advertises
  `client_id_metadata_document_supported: true`.
- Exactly `finance.summary.read` and `payroll.summary.read`, owner login `alex`,
  exact owner ID from the existing approved binding, clinic `curai`.
- Only `get_finance_summary` and `get_payroll_summary`; expiry is consent time plus
  30 * 86400 seconds. Requests cannot choose owner, clinic, scopes or another client.

The backend (`medcrm-backend.service`, root) owns all authorization, token,
revocation and discovery routes in `backend/reporting/oauth_server.py`. It uses
the existing DB and `authenticate_user` / `hydrate_access` directly. Passwords
are transient login inputs; no CRM JWT is issued or retained. Approval rechecks
the current owner, active user/staff, clinic, role consistency, password expiry
and both required permissions. Each report independently rechecks the current
identity, required permission, token hash, revocation and expiry before data reads.
The existing `APP_CLINIC_ID` / `CONSENT_CLINIC_ID` auth configuration must resolve
to `curai`; do not bypass a mismatch.

The sidecar (`medcrm-finance-mcp.service`) remains
`medcrm-finance-mcp:medcrm-finance-mcp`, loopback `127.0.0.1:8766`. It serves only
`/api/reporting/mcp`. It never constructs, reads or writes an OAuth store and does
not import backend authentication or DB dependencies. Its 401 challenge points to
the backend protected-resource document. Never run this sidecar as root or give
it access to the OAuth directory. Existing Paperclip runtime, binding fields,
token, grant file and tool policy are preserved. The `ref-2` deploy workflow must
restart both backend and sidecar after code updates, and pass an unauthenticated
Grok-Origin MCP probe that returns 401; a 403 indicates the Grok origin was not
activated, not a failed OAuth login.

Authorization uses the version-controlled operator-pinned snapshot of the single
approved public Grok client in `backend/reporting/oauth_server.py`. Production
egress to its exact CIMD URL returns 403 `text/html`; no metadata HTTP request is
made at runtime. Snapshot updates require code review. Wrong client_id, missing
web redirect, non-public auth method, missing code response type, missing
authorization_code grant and duplicate list entries are rejected before login.
The official snapshot also lists the console callback and refresh_token; server
acceptance remains restricted to the exact Grok web callback, PKCE S256, the two
approved scopes and a 30-day access grant. The console callback and refresh grant
remain rejected; refresh tokens are never issued.

## Shared binding and root-only state

The backend's `REPORTING_BINDING_FILE` and sidecar's `FINANCE_MCP_BINDING_FILE`
must name the **exact same absolute file path**, for example
`/etc/medcrm/finance-mcp/binding.json`. Identical copies in different directories
are not supported. The backend resolver and OAuth routes receive the same store,
derived from the binding path:

```text
/etc/medcrm/finance-mcp/grok-oauth/grok-oauth.json
```

The existing binding and Paperclip grants must not be rewritten for Grok. Preserve
`/etc/medcrm/finance-mcp` as root:medcrm-finance-mcp 0750 and its binding as
root:medcrm-finance-mcp 0640. The separately provisioned `grok-oauth` child must
be root:root 0700; `grok-oauth.json` must be root:root 0600, a regular single-link
file. Its lock and atomic temporary files are also root-owned 0600. Missing state
fails closed; application startup does not provision directories/files. Windows
ACL fallback and permission relaxation are not supported.

For a later reviewed provisioning action, create only the missing dedicated child
directory with `install -d -o root -g root -m 0700 .../grok-oauth`. Create a new
state file exclusively (never truncate an existing grant), root-owned with mode
0600. Populate exactly this schema, substituting only the verified binding owner
ID; validate with `validate_state` and `OAuthFileStore.read()` before enabling
authorization. This template contains no credential and is not a live grant:

```json
{
  "version": 1,
  "client_id": "https://grok.com/oauth/mcp-client.json",
  "clinic_id": "curai",
  "owner_id": "REPLACE_WITH_VERIFIED_BINDING_OWNER_ID",
  "owner_login": "alex",
  "scopes": ["finance.summary.read", "payroll.summary.read"],
  "active": true,
  "consented_at": null,
  "expires_at": null,
  "code_hash": null,
  "code_expires_at": null,
  "code_challenge": null,
  "token_hash": null
}
```

An active unexpired token or live unexchanged code denies a second grant. After
expiry, revocation or an expired unexchanged code, the owner must start again,
log in and explicitly consent. Approval atomically replaces all previous code
and token hashes and starts a new 30-day term. Code redemption is single-use;
revocation clears hashes. Old tokens/codes cannot authorize or revoke a new
grant. Transactions from an earlier grant revision cannot approve a new grant.
Restarting the backend discards pending in-memory login transactions; start the
flow again. It does not renew an existing grant. Report expiry is always checked
from stored consent time, independently of process lifetime.

## Live HTTPS Nginx and Uvicorn configuration

The proxy changes are applied to the live HTTPS vhost: `nginx -t` passed and nginx
reloaded active. The `/api/` prefix and the three exact OAuth discovery routes target
backend port 8001 with the external Host and HTTPS scheme. Backend and sidecar
Uvicorn drop-ins are installed and loaded; their service processes take the new
loopback-only forwarded-header trust settings on their next restart. The preceding
production revision lacks the OAuth handlers; deploying this feature commit
activates them behind these proxy routes.

Existing `/api/` routes target backend port 8001. OAuth
`/api/reporting/oauth/authorize`, `/token` and `/revoke` stay on that backend
proxy. The effective `/api/` block preserves existing directives and adds the
forwarded HTTPS scheme:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    # Retain other existing /api/ proxy directives.
}
```

Add these exact locations in the **HTTPS vhost**, all targeting the backend,
preserving the complete request URI. Each exact OAuth discovery location must
set both Host and X-Forwarded-Proto; do not route them to port 8766 or a frontend:

```nginx
location = /.well-known/oauth-authorization-server {
    proxy_pass http://127.0.0.1:8001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
location = /.well-known/oauth-protected-resource/api/reporting/mcp {
    proxy_pass http://127.0.0.1:8001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
location = /.well-known/oauth-protected-resource {
    proxy_pass http://127.0.0.1:8001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

If an operator uses additional exact `/api/reporting/oauth/*` locations instead
of the existing prefix, every such location must also target backend 8001 and
explicitly set `proxy_set_header Host $host` and
`proxy_set_header X-Forwarded-Proto $scheme`.

The existing exact MCP route must remain on the unprivileged sidecar:

```nginx
location = /api/reporting/mcp {
    proxy_pass http://127.0.0.1:8766;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    # Preserve the existing MCP proxy directives.
}
```

Backend Uvicorn must remain loopback-only and trust forwarded headers only from
the localhost proxy. Its reviewed command must retain existing service settings:

```sh
/opt/medcrm/venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8001 \
  --proxy-headers --forwarded-allow-ips=127.0.0.1
```

Use the same explicit forwarded-header trust on the sidecar's loopback Uvicorn
command. Do not use `*` or expose either upstream port. OAuth endpoints require
HTTPS scheme as interpreted by Uvicorn and exactly Host `medcrm.duckdns.org`;
the application never trusts a raw X-Forwarded-Proto header itself. Consent POSTs
use a synchronizer-token CSRF check: the opaque random `__Host-medcrm-grok-oauth`
Secure/HttpOnly cookie must exactly match the hidden form transaction, and that
transaction must exist server-side. Duplicate or missing cookies, mismatches and
unknown transactions fail closed. Each validated POST consumes its transaction;
transactions expire after 10 minutes and retain binding/state-revision checks.
The browser Origin value is not the CSRF proof; unexpected or absent Origin does
not reject an otherwise matching cookie/transaction. Avoid query/body/header logging for OAuth requests;
never print authorization codes, bearer tokens, passwords or CRM records.

## Later release verification and rollback

Before a later release, separately verify the rollback artifact, source revision,
existing service/proxy configuration and how to restore them. Record identities
and file modes without printing grants or secrets. Preserve current Paperclip
grant state; restoring source must not restore a revoked OAuth token. A source
rollback does not itself revoke a token. Stop/revoke Grok access as part of the
reviewed rollback and verify old bearer denial.

After review, run `nginx -t`, then verify known CRM health directly with
`http://127.0.0.1:8001/` (the source route returns
`{"message":"Medical CRM API is running"}`). `/api/health` was 404 and must not be
used as the health check. Verify the existing public CRM entrypoint separately;
do not assume `/` through the public vhost reaches the backend.

Verify public HTTPS discovery, exact issuer/endpoints/scopes/CIMD flag, protected
resource URL from the sidecar 401, TLS/Host behavior, service UIDs and root-only
store accessibility. Then perform real Grok web owner login, explicit consent,
code exchange and calls to both approved tools. Check active-token second-grant
denial, revocation, old-token denial and manual re-consent without exposing raw
credentials. Recheck Paperclip tool policy/calls unchanged. Synthetic tests and
published metadata alone do not establish actual Grok compatibility.

## Isolated verification commands

Temporary consent POST diagnostics use logger `reporting.oauth_server` at WARNING:
`grok_oauth_consent_rejected stage=<fixed stage>`. The LogRecord also has a `stage`
field. Only code-defined stage labels are recorded, with no request values or
exception details. Client errors and statuses are unchanged; a 403 still returns
only `{"error":"access_denied"}`. Remove this diagnostic block after diagnosis.

Login gates include `transaction_cookie`, `transaction_expired`,
`state_binding`, `grant_available`, `state_revision`, `login_form`, `login_limit`,
`crm_auth_exception`, `credentials_rejected`, `owner_profile` and `owner_recheck`.
Approval also uses `approval_owner`, `grant_update` and `approval_redirect`;
`login_page` covers rendering after successful authentication. Expired transactions
are normally pruned before consent, so a retry with one records
`transaction_cookie`, as does a missing transaction after a worker restart. No
transaction or cookie values are recorded to distinguish these cases.

Run from this checkout, using the dedicated Python 3.13 test environment only:

```powershell
& C:/Users/alex/AppData/Local/Temp/medcrm-finance-mcp-test-313/Scripts/python.exe -B -m pytest tests/finance_readonly -q --tb=short
docker run --rm --mount type=bind,source=C:/Users/alex/AppData/Local/Temp/medcrm-grok-mcp-oauth,target=/workspace,readonly --tmpfs /tmp:exec,mode=1777 -w /workspace python:3.13-slim sh -c 'python -m pip install --disable-pip-version-check -q -r tools/finance_mcp/requirements-oauth-test.lock.txt && python -B -m pytest -p no:cacheprovider tests/finance_readonly/test_grok_oauth_store.py tests/finance_readonly/test_grok_sidecar_runtime.py -q --tb=short'
git diff --check
```

The container tests execute backend OAuth with a real root-only file store and
synthetic CRM data, then run a separate sidecar process under UID/GID 65534,
proving it cannot read that store and exposes only the MCP path. These are isolated
test identities, not production service account changes. Do not install these
test dependencies into backend or sidecar production environments.
