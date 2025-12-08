# Security Recommendations & Local Dev Checklist

This file captures the security recommendations for the project and provides
practical steps you can run locally to reduce risk.

Quick actions performed by the agent:
- Removed service-account JSON from commits and added `.gitignore` entries
- Added `scripts/security_audit.js` to flag inline handlers and secret files
- Hardened the local dev server to send common security headers

High-priority items (do these immediately):

- Rotate the Firebase service-account key(s) that may have been exposed.
  - Create a new key in the Google Cloud Console and replace uses.
  - Revoke the old key and remove it from any machines and CI variables.

- Use environment variables or a secret manager for service account JSON
  instead of committing files to the repository.

Recommended developer workflow for local runs

1. Put your service account JSON outside the repo and point to it using the
   `GOOGLE_APPLICATION_CREDENTIALS` environment variable (example in `.env.example`).

2. Start the dev server without committing secrets. If you need to allow old
   inline handlers for a short time, set `DEV_ALLOW_UNSAFE_INLINE=1` in your
   environment (only for local dev). Example (PowerShell):

   ```powershell
   $env:DEV_ALLOW_UNSAFE_INLINE='1'
   $env:GOOGLE_APPLICATION_CREDENTIALS='C:\path\to\your\service-account.json'
   py .\tearasnew-from-bundle\dev_server.py 5500 .\tearasnew-from-bundle
   ```

3. Run the security audit to find inline handlers and other issues:

   ```powershell
   node scripts\security_audit.js
   ```

Refactor guidance (medium-term):

- Remove all inline event handlers (attributes like `onclick=`) and replace
  them with unobtrusive event listeners added via external JS files. This
  allows removing `unsafe-inline` from your CSP.

- Replace any `document.write`, `eval`, or dynamic script building with
  safer constructs.

- Implement CSP using nonces or hashes for any remaining inline snippet
  you must keep. Nonces should be generated per-request by your server and
  added to `<script nonce="...">` tags and the CSP header.

- Add CI checks: run `node scripts/security_audit.js` in CI and fail builds on findings.

Cleaning history (if a secret was pushed):

- If a service-account file was ever pushed to a public repo, rotate keys
  immediately. To purge the secret from git history, use `git filter-repo`
  or the BFG repo-cleaner. Be careful: rewriting history will require
  coordination with all contributors.

Security headers added to the local dev server (see `dev_server.py`):
- `Content-Security-Policy` (adjusts to `DEV_ALLOW_UNSAFE_INLINE` when set)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer-when-downgrade`
- `Permissions-Policy` (example: geolocation and microphone disabled)
- `X-XSS-Protection: 1; mode=block` (legacy)

If you want, I can:
- Add a CI job that runs `node scripts/security_audit.js` and fails on findings.
- Help refactor the most common inline handlers (I can patch simple event handlers automatically).
- Add a pre-commit hook to prevent accidental commits of `*-firebase-adminsdk-*.json` files.
