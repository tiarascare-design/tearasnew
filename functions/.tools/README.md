# .tools (emulator helper scripts)

This directory contains convenience helper scripts intended for local emulator testing only. They seed or verify the master-reset password hash and provide a simple end-to-end runner for the master-reset flow.

Files:
- `seed_master_password.js` - compute a SHA-256 of a random or supplied password and write `masterResetPasswordHash` into Firestore emulator.
- `write_master_hash.js` - write a precomputed hash into the emulator (useful to avoid shell quoting issues).
- `read_master_hash.js` - print the siteSettings document to inspect the stored hash.
- `verify_master_password.js` - compute SHA-256 of a supplied plaintext and compare it to the stored `masterResetPasswordHash`.
- `run_master_reset_e2e.js` - create an admin user in the Auth emulator, sign in, request a token and perform master reset via the functions emulator.

Note: The repository's Cloud Functions no longer export the `adminRequestMasterReset` / `adminMasterReset` endpoints. The `run_master_reset_e2e.js` script has been disabled to avoid accidental destructive operations. If you need a local-only reset helper, implement it carefully under `.tools` and ensure it is never run against production.

Security note: These scripts are powerful and intended only for local development. Do NOT run against production or commit sensitive passwords into the repository. Keep them out of CI and production deployments.
