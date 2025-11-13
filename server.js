// server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';
const APP_BASE = process.env.APP_BASE_URL || 'http://localhost:8080';

// --- LWA client creds
const LWA_CLIENT_ID = process.env.LWA_CLIENT_ID || '';
const LWA_CLIENT_SECRET = process.env.LWA_CLIENT_SECRET || '';

// --- stores meta (kavplus:KAV PLUS|jk:J&K)
const STORE_LIST = (process.env.STORE_LIST || '').split('|').filter(Boolean).map(pair => {
  const [id, name] = pair.split(':');
  return { id, name };
});

// helper: read refresh token env by convention REFRESH_TOKEN_<storeId>
const getRefreshToken = (storeId) => process.env[`REFRESH_TOKEN_${storeId}`];

// helper: exchange refresh token for access token (LWA)
async function getAccessToken(storeId) {
  const refresh_token = getRefreshToken(storeId);
  if (!refresh_token) {
    throw new Error(`Missing refresh token for store "${storeId}". Add REFRESH_TOKEN_${storeId} in Render env.`);
  }
  if (!LWA_CLIENT_ID || !LWA_CLIENT_SECRET) {
    throw new Error('Missing LWA_CLIENT_ID or LWA_CLIENT_SECRET.');
  }

  const res = await fetch('https://api.amazon.com/auth/o2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token,
      client_id: LWA_CLIENT_ID,
      client_secret: LWA_CLIENT_SECRET
    })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`LWA token error: ${res.status} ${JSON.stringify(data)}`);
  }
  // Example: { access_token, token_type:'bearer', expires_in:3600 }
  return data;
}

// ----- BASIC ROUTES
app.get('/', (_req, res) => {
  res.send('KavPlus Backend Running ✅');
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), ts: new Date().toISOString() });
});

// ----- STORE MANAGEMENT
// Return list of stores & whether each has a refresh token loaded
app.get('/api/stores', (_req, res) => {
  const stores = STORE_LIST.map(s => ({
    id: s.id,
    name: s.name,
    connected: !!getRefreshToken(s.id)
  }));
  res.json({ ok: true, stores });
});

// Get an access token for a given store (for testing)
app.get('/api/token', async (req, res) => {
  try {
    const store = (req.query.store || STORE_LIST[0]?.id || '').trim();
    if (!store) return res.status(400).json({ ok: false, error: 'No store supplied' });
    const tok = await getAccessToken(store);
    res.json({ ok: true, store, token_type: tok.token_type, expires_in: tok.expires_in });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

// Placeholder "connect" pages so you don’t see 404s if clicked
app.get('/connect/spapi', (_req, res) => {
  // Private developer doesn’t use OAuth UI; show info page instead.
  res.send('<h3>Private Developer</h3><p>Refresh tokens are managed in Render env. No interactive connect needed.</p>');
});
app.get('/connect/ads', (_req, res) => {
  res.send('<h3>Ads Connect</h3><p>Coming later. For now, add refresh tokens in env variables.</p>');
});

// Example protected test endpoint: just proves the access token is mintable
app.get('/api/ping-spapi', async (req, res) => {
  try {
    const store = (req.query.store || STORE_LIST[0]?.id || '').trim();
    if (!store) return res.status(400).json({ ok: false, error: 'No store supplied' });
    const tok = await getAccessToken(store);
    res.json({ ok: true, store, got_access_token: !!tok.access_token, expires_in: tok.expires_in });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
