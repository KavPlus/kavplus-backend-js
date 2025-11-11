# Kav+ Multi-Store Drop‑in

This bundle adds **multi-store** support (KAV PLUS + J&K) to your backend and a dashboard store switcher.

## Files in this ZIP

```
/stores.json
/storeRepo.js
/server.routes.multistore.js   ← paste into your existing server.js
/dashboard-store-switch.html   ← copy/paste into your dashboard page
/.env.multistore.example       ← updated env template
```

## Where to put them

1) **Backend (GitHub → kavplus-backend-js repo, root next to `server.js`):**
- Upload `stores.json` and `storeRepo.js`.

2) **Update `server.js`:**
- Open `server.routes.multistore.js` and copy **everything** into your `server.js`:
  - The two imports at the top
  - The `/api/stores`, `/api/status`, `/api/connect/spapi/:store`, `/api/callback/spapi` routes
  - (Optional) the two short-link shims
- Commit & push.

3) **Render:**
- In the backend service → **Environment**:
  - Keep: `API_BASE_URL`, `APP_BASE_URL`, `PORT`, `LWA_CLIENT_ID`, `LWA_CLIENT_SECRET`, `SPAPI_REGION`.
  - **Remove**: `SPAPI_REFRESH_TOKEN`, `LWA_CLIENT_ID1`, `LWA_CLIENT_SECRET1`, `SPAPI_REGION1`, `SPAPI_ENV` (unless you deliberately want sandbox).
- **Allowed Return URL** in your LWA Security Profile:
  - `https://api.kavplus.uk/api/callback/spapi`

4) **Dashboard (Netlify / static site):**
- Open your `dashboard` page and paste the contents of `dashboard-store-switch.html` into the appropriate section.

## How to test (checklist)

- `https://api.kavplus.uk/health` → `{"status":"ok", ...}`
- `https://api.kavplus.uk/api/stores` → shows `kavplus` & `jk`
- Dashboard shows **System Status** with both stores
- Click **Connect SP-API** for each store and grant consent
- Status should show `spapiConnected: true` for each store

## Notes

- File storage on Render is **ephemeral** across rebuilds. For production, move `stores.json` to your DB later (keep the same `storeRepo` function names).
- Frontend calls should pass the active store in query string, e.g. `?store=kavplus` or `?store=jk`.

Generated on: 2025-11-11T01:35:15.511859Z
