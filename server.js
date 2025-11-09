// server.js
// Node 18+, package.json "type": "module"

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// ---------- Config ----------
const PORT = process.env.PORT || 3000;
const API_BASE_URL = (process.env.API_BASE_URL || '').replace(/\/$/, '');
const APP_BASE_URL = (process.env.APP_BASE_URL || '').replace(/\/$/, '');

// AI providers (optional)
const OPENAI_API_KEY      = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL     = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_MODEL        = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// Amazon LWA (optional for connect buttons)
const LWA_CLIENT_ID       = process.env.LWA_CLIENT_ID || process.env.ADS_LWA_CLIENT_ID || '';
const LWA_REDIRECT_SPAPI  = `${APP_BASE_URL || 'https://app.kavplus.uk'}/api/connect/spapi/callback`;
const LWA_REDIRECT_ADS    = `${APP_BASE_URL || 'https://app.kavplus.uk'}/api/connect/ads/callback`;

// ---------- Middleware ----------
app.use(express.json({ limit: '1mb' }));

// Allow your front-ends
const allowed = [
  'https://kavplus.uk',
  'https://app.kavplus.uk'
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // allow same-origin or server-to-server
    if (!origin || allowed.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'), false);
  },
  optionsSuccessStatus: 200
}));

// ---------- Health ----------
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), ts: new Date().toISOString() });
});

// ---------- API: status ----------
app.get('/api/status', (req, res) => {
  res.json({
    api: {
      base: API_BASE_URL || `https://${req.headers.host}`,
      ok: true
    },
    provider: {
      name: OPENAI_API_KEY ? 'openai-compatible' : 'demo',
      model: OPENAI_MODEL
    },
    tokens: {
      spapi: Boolean(LWA_CLIENT_ID),
      ads:   Boolean(LWA_CLIENT_ID)
    },
    timestamp: new Date().toISOString()
  });
});

// ---------- API: chat (ChatKAV+) ----------
app.post('/api/chat', async (req, res) => {
  try {
    const { message, system } = req.body || {};
    const userText = (message || '').toString().trim();

    if (!userText) {
      return res.status(400).json({ ok: false, error: 'Missing "message" in body.' });
    }

    // If no key, return a demo reply so the UI works
    if (!OPENAI_API_KEY) {
      return res.json({
        ok: true,
        provider: 'demo',
        reply: `👋 Hi from ChatKAV+ demo! You said: "${userText}". Add OPENAI_API_KEY on Render to enable real LLM responses.`
      });
    }

    // OpenAI-compatible chat
    const payload = {
      model: OPENAI_MODEL,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: userText }
      ]
    };

    const r = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(502).json({ ok: false, error: 'Upstream error', detail: text });
    }

    const data = await r.json();
    const reply = data?.choices?.[0]?.message?.content || '(no reply)';
    res.json({ ok: true, provider: 'openai-compatible', model: OPENAI_MODEL, reply });

  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e?.message || 'Server error' });
  }
});

// ---------- Amazon Connect placeholders ----------

// SP-API: redirect user to Amazon LWA
app.get('/api/connect/spapi', (req, res) => {
  if (!LWA_CLIENT_ID) {
    return res.status(501).json({
      ok: false,
      error: 'LWA_CLIENT_ID not set. Add it on Render → Environment.',
      hint: 'Once set, this endpoint will redirect to Amazon for authorization.'
    });
  }
  // Most dev flows use “profile”/“offline_access” scopes while you test;
  // you will replace scopes with the ones Amazon approves for your app.
  const scopes = encodeURIComponent('profile offline_access');

  const url = `https://www.amazon.com/ap/oa?` +
    `client_id=${encodeURIComponent(LWA_CLIENT_ID)}` +
    `&scope=${scopes}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(LWA_REDIRECT_SPAPI)}`;

  res.redirect(url);
});

// SP-API OAuth callback (just shows the code so you can confirm it’s working)
app.get('/api/connect/spapi/callback', (req, res) => {
  const { code, state, error, error_description } = req.query;
  res.send(`
    <h2>SP-API Callback</h2>
    <pre>${JSON.stringify({ code, state, error, error_description }, null, 2)}</pre>
    <p>Store the code server-side and exchange for tokens next.</p>
  `);
});

// Ads (placeholder — same pattern)
app.get('/api/connect/ads', (req, res) => {
  if (!LWA_CLIENT_ID) {
    return res.status(501).json({ ok: false, error: 'LWA_CLIENT_ID not set' });
  }
  const scopes = encodeURIComponent('profile offline_access');
  const url = `https://www.amazon.com/ap/oa?client_id=${encodeURIComponent(LWA_CLIENT_ID)}&scope=${scopes}&response_type=code&redirect_uri=${encodeURIComponent(LWA_REDIRECT_ADS)}`;
  res.redirect(url);
});

app.get('/api/connect/ads/callback', (req, res) => {
  const { code, state, error, error_description } = req.query;
  res.send(`
    <h2>Ads Callback</h2>
    <pre>${JSON.stringify({ code, state, error, error_description }, null, 2)}</pre>
  `);
});

// JSON 404 for /api/* so the dashboard never receives HTML
app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, error: 'Not found', path: req.path });
});

// Home
app.get('/', (req, res) => {
  res.send('KavPlus Backend Running ✅');
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`KavPlus backend running on ${PORT}`);
});
