// server.js (KavPlus Backend) — ESM, Node 18+

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json({ limit: "2mb" }));

/* -------------------- CORS (lock to your domains) -------------------- */
const allowlist = [
  process.env.APP_BASE_URL || "https://app.kavplus.uk",
  process.env.API_BASE_URL || "https://api.kavplus.uk",
  "https://kavplus.uk",
  "https://www.kavplus.uk",
  "http://localhost:3000", // optional for local dev
  "http://localhost:5173", // optional for Vite dev
].filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowlist.includes(origin)) return cb(null, true);
      return cb(new Error("CORS blocked: " + origin));
    },
    credentials: true,
  })
);

/* -------------------- Basics -------------------- */
app.get("/", (_req, res) => {
  res.send("KavPlus Backend Running 🚀");
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), ts: new Date().toISOString() });
});

/* -------------------- In-memory store (replace with DB later) -------------------- */
const TOKENS = {
  spapi: null, // { refresh_token, region, saved_at }
  ads: null,   // { refresh_token, api_base, saved_at }
};

/* -------------------- Admin status (for dashboard) -------------------- */
app.get("/admin/status", (_req, res) => {
  res.json({
    api: { base: process.env.API_BASE_URL || null, ok: true },
    provider: (process.env.AI_PROVIDER || "auto").toLowerCase(),
    model: process.env.AI_MODEL || "default",
    tokens: {
      spapi: !!TOKENS.spapi?.refresh_token,
      ads: !!TOKENS.ads?.refresh_token,
    },
    timestamp: new Date().toISOString(),
  });
});

/* ====================================================================
   ChatKAV+ — universal AI chat with streaming (SSE)
   Providers: OpenAI, Anthropic, Gemini, AIMLAPI(OpenAI-compatible)
   ==================================================================== */
const PROVIDER = (process.env.AI_PROVIDER || "auto").toLowerCase();
const DEFAULT_MODEL = process.env.AI_MODEL || "gpt-4o-mini";

function pickProvider() {
  if (PROVIDER !== "auto") return PROVIDER;
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.AIMLAPI_API_KEY) return "aimlapi";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return "openai";
}

/**
 * POST /ai/chat
 * Body: {
 *   messages: [{role:"system"|"user"|"assistant", content:"..."}],
 *   provider?: "auto"|"openai"|"anthropic"|"gemini"|"aimlapi",
 *   model?: string, temperature?: number, max_tokens?: number, system?: string
 * }
 * SSE stream: lines "data: { token: '...' }"
 */
app.post("/ai/chat", async (req, res) => {
  try {
    const chosen = (req.body?.provider || pickProvider()).toLowerCase();
    const model = req.body?.model || DEFAULT_MODEL;
    const temperature = typeof req.body?.temperature === "number" ? req.body.temperature : 0.7;
    const max_tokens = typeof req.body?.max_tokens === "number" ? req.body.max_tokens : 512;
    const system = req.body?.system || "You are ChatKAV+, a helpful assistant for Amazon sellers.";
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    const end = () => res.end();

    // Normalize (OpenAI style) with system first
    const normalized = [{ role: "system", content: system }, ...messages];

    // ----- OpenAI & AIMLAPI (OpenAI-compatible streaming) -----
    if (chosen === "openai" || chosen === "aimlapi") {
      const base =
        chosen === "aimlapi"
          ? process.env.AIMLAPI_BASE?.replace(/\/+$/, "") || "https://api.aimlapi.com/v1"
          : "https://api.openai.com/v1";
      const key = chosen === "aimlapi" ? process.env.AIMLAPI_API_KEY : process.env.OPENAI_API_KEY;
      if (!key) {
        send({ error: `${chosen.toUpperCase()} key missing` });
        return end();
      }

      const r = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: normalized,
          temperature,
          max_tokens,
          stream: true,
        }),
      });

      if (!r.ok || !r.body) {
        const text = await r.text().catch(() => "");
        send({ error: `${chosen} error ${r.status}: ${text}` });
        return end();
      }

      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const s = line.trim();
          if (!s.startsWith("data:")) continue;
          const payload = s.slice(5).trim();
          if (payload === "[DONE]") {
            end();
            return;
          }
          try {
            const json = JSON.parse(payload);
            const delta = json?.choices?.[0]?.delta?.content;
            if (delta) send({ token: delta });
          } catch {
            /* ignore */
          }
        }
      }
      end();
      return;
    }

    // ----- Anthropic (Claude) streaming -----
    if (chosen === "anthropic") {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) {
        send({ error: "ANTHROPIC_API_KEY missing" });
        return end();
      }

      const sys = normalized.find((m) => m.role === "system")?.content;
      const userMsgs = normalized.filter((m) => m.role !== "system");

      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model || "claude-3-5-sonnet-20240620",
          max_tokens,
          temperature,
          system: sys,
          messages: userMsgs.map((m) => ({ role: m.role, content: m.content })),
          stream: true,
        }),
      });

      if (!r.ok || !r.body) {
        const text = await r.text().catch(() => "");
        send({ error: `Anthropic error ${r.status}: ${text}` });
        return end();
      }

      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split("\n")) {
          try {
            const evt = JSON.parse(line);
            const text = evt?.delta?.text || evt?.content_block?.text || "";
            if (text) send({ token: text });
          } catch {
            /* skip non-JSON lines */
          }
        }
      }
      end();
      return;
    }

    // ----- Gemini (non-stream fallback) -----
    if (chosen === "gemini") {
      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        send({ error: "GEMINI_API_KEY missing" });
        return end();
      }

      const concat = normalized
        .filter((m) => m.role !== "system")
        .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
        .join("\n");

      const mdl = model || "gemini-1.5-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        mdl
      )}:generateContent?key=${encodeURIComponent(key)}`;

      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: concat }] }],
          generationConfig: { temperature, maxOutputTokens: max_tokens },
        }),
      });

      if (!r.ok) {
        const text = await r.text().catch(() => "");
        send({ error: `Gemini error ${r.status}: ${text}` });
        return end();
      }
      const data = await r.json();
      const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
      for (const ch of text) send({ token: ch });
      end();
      return;
    }

    send({ error: `Unknown provider: ${chosen}` });
    end();
  } catch (e) {
    console.error(e);
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
    res.end();
  }
});

/* ====================================================================
   Amazon Connect Stubs — SP-API & Ads
   ==================================================================== */
function buildLwaAuthUrl({ clientId, redirectUri, scope, state }) {
  const base = "https://www.amazon.com/ap/oa";
  const params = new URLSearchParams({
    client_id: clientId,
    scope,
    response_type: "code",
    redirect_uri: redirectUri,
    state: state || Math.random().toString(36).slice(2),
  });
  return `${base}?${params.toString()}`;
}

async function exchangeAuthCodeForTokens({ code, clientId, clientSecret, redirectUri }) {
  const r = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!r.ok) throw new Error(`LWA token exchange failed: ${r.status} ${await r.text()}`);
  return r.json(); // { access_token, refresh_token, ... }
}

async function getAccessTokenFromRefresh({ refreshToken, clientId, clientSecret }) {
  const r = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!r.ok) throw new Error(`LWA refresh failed: ${r.status} ${await r.text()}`);
  return r.json(); // { access_token, expires_in, token_type }
}

/* ---- SP-API connect ---- */
app.get("/connect/spapi/start", (req, res) => {
  const scope = "sellingpartnerapi::migration";
  const redirectUri = `${process.env.API_BASE_URL}/connect/spapi/callback`;
  const url = buildLwaAuthUrl({
    clientId: process.env.LWA_CLIENT_ID,
    redirectUri,
    scope,
  });
  res.redirect(url);
});

app.get("/connect/spapi/callback", async (req, res) => {
  try {
    const { code, error, error_description } = req.query;
    if (error) return res.status(400).send(`LWA error: ${error} - ${error_description || ""}`);
    if (!code) return res.status(400).send("Missing code");

    const redirectUri = `${process.env.API_BASE_URL}/connect/spapi/callback`;
    const tokens = await exchangeAuthCodeForTokens({
      code,
      clientId: process.env.LWA_CLIENT_ID,
      clientSecret: process.env.LWA_CLIENT_SECRET,
      redirectUri,
    });

    TOKENS.spapi = {
      refresh_token: tokens.refresh_token,
      region: process.env.SPAPI_REGION || "eu", // eu | na | fe
      saved_at: new Date().toISOString(),
    };

    res.send("✅ SP-API refresh token saved (in memory). Replace with DB storage later.");
  } catch (e) {
    console.error(e);
    res.status(500).send(`SP-API connect failed: ${e.message}`);
  }
});

/* ---- Amazon Ads connect ---- */
app.get("/connect/ads/start", (req, res) => {
  const scope = "advertising::campaign_management";
  const redirectUri = `${process.env.API_BASE_URL}/connect/ads/callback`;
  const url = buildLwaAuthUrl({
    clientId: process.env.ADS_LWA_CLIENT_ID,
    redirectUri,
    scope,
  });
  res.redirect(url);
});

app.get("/connect/ads/callback", async (req, res) => {
  try {
    const { code, error, error_description } = req.query;
    if (error) return res.status(400).send(`LWA error: ${error} - ${error_description || ""}`);
    if (!code) return res.status(400).send("Missing code");

    const redirectUri = `${process.env.API_BASE_URL}/connect/ads/callback`;
    const tokens = await exchangeAuthCodeForTokens({
      code,
      clientId: process.env.ADS_LWA_CLIENT_ID,
      clientSecret: process.env.ADS_LWA_CLIENT_SECRET,
      redirectUri,
    });

    const defaultAdsBase = "https://advertising-api-eu.amazon.com";
    TOKENS.ads = {
      refresh_token: tokens.refresh_token,
      api_base: process.env.ADS_API_BASE || defaultAdsBase,
      saved_at: new Date().toISOString(),
    };

    res.send("✅ Ads refresh token saved (in memory). Replace with DB storage later.");
  } catch (e) {
    console.error(e);
    res.status(500).send(`Ads connect failed: ${e.message}`);
  }
});

/* ---- Test: Ads profiles ---- */
app.get("/ads/profiles", async (_req, res) => {
  try {
    if (!TOKENS.ads?.refresh_token) {
      return res
        .status(400)
        .json({ error: "No Ads refresh token stored yet. Connect first at /connect/ads/start" });
    }

    const { access_token } = await getAccessTokenFromRefresh({
      refreshToken: TOKENS.ads.refresh_token,
      clientId: process.env.ADS_LWA_CLIENT_ID,
      clientSecret: process.env.ADS_LWA_CLIENT_SECRET,
    });

    const base = TOKENS.ads.api_base || "https://advertising-api-eu.amazon.com";
    const r = await fetch(`${base}/v2/profiles`, {
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
        "Amazon-Advertising-API-ClientId": process.env.ADS_LWA_CLIENT_ID,
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

/* -------------------- Start server -------------------- */
const port = process.env.PORT || 3000; // Render injects PORT in production
app.listen(port, () => console.log(`✅ KavPlus backend running on ${port}`));
