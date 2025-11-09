# Cloud Functions for Admin Order Updates

This adds a secure callable function to update order status in both the public orders collection and the corresponding user subcollection, using the Admin SDK.

## Function
- `adminUpdateOrderStatus`
  - Request data: `{ appId: string, orderId: string, userId: string, status: string }`
  - Auth: Only user with UID `5FA4SZNeMicQz0MC1waRTSUh0lB2` (ADMIN_UID) is allowed.
  - Behavior: Updates `artifacts/{appId}/public/data/orders/{orderId}` and `artifacts/{appId}/users/{userId}/orders/{orderId}`.

- `adminMasterReset`
   - Request data: `{ appId: string, targets?: string[] }` where `targets` can be any of `products|productGroups|heroSlides|galleryImages|testimonials|purchases|localSales|salesReturns|purchaseReturns|orders`. If `targets` is omitted the function will attempt to reset all public targets. The function will also attempt to delete per-user carts and per-user order copies, reset counters and siteSettings.
   - Auth: Only admin UID `5FA4SZNeMicQz0MC1waRTSUh0lB2` can call this.
   - Behavior: Performs bulk deletions/overwrites under `artifacts/{appId}/public/data/...` and user-scoped paths using Admin SDK privileges and returns a summary object.

   - Safety: The callable now requires a confirmation string typed by the admin. Include `confirmation: 'RESET'` in the request data (the frontend prompts for this exact string before calling). This prevents accidental invocation.
   - Implementation notes: Deletes are performed in paginated batches using Admin SDK bulkWriter to avoid snapshot/timeouts on large collections. For very large datasets you may still need to run the callable per-target by supplying the `targets` array (e.g. `['products']`) to split the work.

      - Token workflow: For additional safety the flow now uses a short-lived token. First call `adminRequestMasterReset` with `{ appId }` to get `{ token, expiresAt }`. Then call `adminMasterReset` with `{ appId, confirmation: 'RESET', token }`. The token is single-use and must be used by the same admin within the TTL (default 5 minutes).

## Deploy (Node.js 20 runtime)
1. Install the Firebase CLI if needed:
   ```pwsh
   npm i -g firebase-tools
   ```
2. Log in and select the project:
   ```pwsh
   firebase login
   firebase use tiaras-website
   ```
3. Install deps and deploy (runtime picked from `engines.node: 20` in `functions/package.json`):
   ```pwsh
   cd functions
   npm install
   cd ..
   firebase deploy --only functions
   ```

## Local test (optional)
If you use emulators:
```pwsh
cd functions
npm install
firebase emulators:start --only functions
```

## Notes
- The web app is already wired to call this function first and will fall back to client writes if the callable is unavailable.
- If you change the admin UID, update it in both `functions/index.js` and `assets/js/app.js`.
