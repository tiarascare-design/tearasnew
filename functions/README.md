# Cloud Functions for Admin Order Updates

This adds a secure callable function to update order status in both the public orders collection and the corresponding user subcollection, using the Admin SDK.

## Function
- `adminUpdateOrderStatus`
  - Request data: `{ appId: string, orderId: string, userId: string, status: string }`
  - Auth: Only user with UID `5FA4SZNeMicQz0MC1waRTSUh0lB2` (ADMIN_UID) is allowed.
  - Behavior: Updates `artifacts/{appId}/public/data/orders/{orderId}` and `artifacts/{appId}/users/{userId}/orders/{orderId}`.

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
