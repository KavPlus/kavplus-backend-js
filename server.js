// server.js (full replacement)

// ----------------------------------------------------
// Base setup
// ----------------------------------------------------
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());                 // You can restrict origins later if you want
app.use(express.json());

// ----------------------------------------------------
// Basic routes
// ----------------------------------------------------
app.get('/', (req, res) => {
  res.send('KavPlus Backend Running 🚀');
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ----------------------------------------------------
// Amazon Connect: helpers
// ----------------------------------------------------

// In-memory token store (replace with a DB later)
const TOKENS = {};

/**
 * Build the Login With Amazon authorization URL.
 * @param {Object} p
 * @param {string} p.clientId
 * @param {string} p.redirectUri
 * @param {string} p.scope
 * @param {string} [p.state]
 */
function buildLwaAuthUrl({ clientId, redirectUri, scope, state }) {
  const base = 'https://www.amazon.com/ap/oa'; // Global OA endpoint
  const params = new URLSearchParams({
    client_id: clientId,
    scope,
    response_type: 'code',
    redirect_uri: redirectUri,
    state: state || Math.random().toString(36).slice(2),
  });
  return `${base}?${params.toString()}`;
}

/**
 * Exchange an auth code for refresh/access tokens via LWA.
 */
async function exchangeAuthCodeForTokens({ code, clientId, clientSecret, redirectUri }) {
  const r = await fetch('https://api.amazon.com/auth/o2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!r.ok) {
    throw new Error(`LWA token exchange failed: ${r.status} ${await r.text()}`);
  }
  return r.json(); // { access_token, refresh_token, expires_in, token_type }
}

/**
 * Get a short-lived access token from a stored refresh token.
 */
async function getAccessTokenFromRefresh({ refreshToken, clientId, clientSecret }) {
  const r = await fetch('https://api.amazon.com/auth/o2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!r.ok) {
    throw new Error(`LWA refresh failed: ${r.status} ${await r.text()}`);
  }
  return r.json(); // { access_token, expires_in, token_type }
}

// ----------------------------------------------------
// SP-API connect flow
// ----------------------------------------------------

/**
 * STEP 1 (SP-API): Send seller to Amazon consent page.
 */
app.get('/connect/spapi/start', (req, res) => {
  const scope = 'sellingpartnerapi::migration';
  const redirectUri = `${process.env.API_BASE_URL}/connect/spapi/callback`;

  const url = buildLwaAuthUrl({
    clientId: process.env.LWA_CLIENT_ID,
    redirectUri,
    scope,
  });

  res.redirect(url);
});

/**
 * STEP 2 (SP-API): Receive code → exchange for refresh token.
 */
app.get('/connect/spapi/callback', async (req, res) => {
  try {
    const { code, error, error_description } = req.query;
    if (error) return res.status(400).send(`LWA error: ${error} - ${error_description || ''}`);
    if (!code) return res.status(400).send('Missing code');

    const redirectUri = `${process.env.API_BASE_URL}/connect/spapi/callback`;

    const tokens = await exchangeAuthCodeForTokens({
      code,
      clientId: process.env.LWA_CLIENT_ID,
      clientSecret: process.env.LWA_CLIENT_SECRET,
      redirectUri,
    });

    TOKENS.spapi = {
      refresh_token: tokens.refresh_token,
      region: process.env.SPAPI_REGION || 'eu', // eu | na | fe
      saved_at: new Date().toISOString(),
    };

    res.send('✅ SP-API refresh token saved (in memory). Replace with DB storage later.');
  } catch (e) {
    console.error(e);
    res.status(500).send(`SP-API connect failed: ${e.message}`);
  }
});

// ----------------------------------------------------
// Amazon Ads connect flow
// ----------------------------------------------------

/**
 * STEP 1 (Ads): Send seller to Amazon Ads consent page.
 */
app.get('/connect/ads/start', (req, res) => {
  const scope = 'advertising::campaign_management';
  const redirectUri = `${process.env.API_BASE_URL}/connect/ads/callback`;

  const url = buildLwaAuthUrl({
    clientId: process.env.ADS_LWA_CLIENT_ID,
    redirectUri,
    scope,
  });

  res.redirect(url);
});

/**
 * STEP 2 (Ads): Receive code → exchange for refresh token.
 */
app.get('/connect/ads/callback', async (req, res) => {
  try {
    const { code, error, error_description } = req.query;
    if (error) return res.status(400).send(`LWA error: ${error} - ${error_description || ''}`);
    if (!code) return res.status(400).send('Missing code');

    const redirectUri = `${process.env.API_BASE_URL}/connect/ads/callback`;

    const tokens = await exchangeAuthCodeForTokens({
      code,
      clientId: process.env.ADS_LWA_CLIENT_ID,
      clientSecret: process.env.ADS_LWA_CLIENT_SECRET,
      redirectUri,
    });

    const defaultAdsBase = 'https://advertising-api-eu.amazon.com';
    TOKENS.ads = {
      refresh_token: tokens.refresh_token,
      api_base: process.env.ADS_API_BASE || defaultAdsBase,
      saved_at: new Date().toISOString(),
    };

    res.send('✅ Ads refresh token saved (in memory). Replace with DB storage later.');
  } catch (e) {
    console.error(e);
    res.status(500).send(`Ads connect failed: ${e.message}`);
  }
});

// ----------------------------------------------------
// Test: get Amazon Ads profiles using stored refresh token
// ----------------------------------------------------
app.get('/ads/profiles', async (req, res) => {
  try {
    if (!TOKENS.ads?.refresh_token) {
      return res
        .status(400)
        .json({ error: 'No Ads refresh token stored yet. Connect first at /connect/ads/start' });
    }

    const { access_token } = await getAccessTokenFromRefresh({
      refreshToken: TOKENS.ads.refresh_token,
      clientId: process.env.ADS_LWA_CLIENT_ID,
      clientSecret: process.env.ADS_LWA_CLIENT_SECRET,
    });

    const base = TOKENS.ads.api_base || 'https://advertising-api-eu.amazon.com';
    const r = await fetch(`${base}/v2/profiles`, {
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json',
        'Amazon-Advertising-API-ClientId': process.env.ADS_LWA_CLIENT_ID,
      },
    });

    if (!r.ok) {
      const body = await r.text();
      throw new Error(`Ads API error ${r.status}: ${body}`);
    }

    const profiles = await r.json();
    res.json({ ok: true, profiles });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------
// Start server
// ----------------------------------------------------
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
