# CHANGELOG

## Unreleased

- Added pagination to admin ledger panes (Cash Book, Bank Book, Sundry Creditors, Sundry Debtors) with per-pane page-size and persistence.
- Centralized pagination event handlers into `attachAdminListeners()`.
- Reset ledger pages after data mutations (new supplier/customer, new purchase, etc.) so new entries are visible.
- Inline Product Group creation from Add Product screen, with duplicate-name prevention.
- Inline Supplier creation from Add Purchase form (creates Firestore doc, updates datalist and state).
- Added a Playwright smoke test scaffold: `tests/purchase_ledgers_smoke.spec.ts`.
- Added a minimal `package.json` to enable Node tooling checks.

Notes:
- Run the local dev server (see `start_local_server.ps1` / `start_local_server.bat`) before using the Playwright test.
- Manual browser verification is recommended for end-to-end flows that require Firebase auth and a running dev server.
