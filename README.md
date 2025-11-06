# KavPlus Backend (JavaScript Version)

A simple Express backend ready to deploy on Render.

## Endpoints
- `/` → Returns "KavPlus Backend Running 🚀"
- `/health` → Returns `{ status: "ok", uptime: ... }`

## Deploy on Render
1. Go to [Render.com](https://render.com) → **New → Web Service**
2. Connect your GitHub repo (after uploading this folder).
3. Configure:
   - **Language:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Root Directory:** *(leave blank)*
4. Add Environment Variables:
   ```
   APP_BASE_URL=https://app.kavplus.uk
   API_BASE_URL=https://api.kavplus.uk
   ```
5. Deploy and open `https://<your-render-app>.onrender.com/health`

You should see `{ "status": "ok", "uptime": ... }`
