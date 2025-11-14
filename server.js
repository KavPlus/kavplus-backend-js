// server.js – clean Kav+ backend

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { listStores, getStoreWithToken } from "./storeRepo.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const API_VERSION = "0.2-demo";

// ---------- MIDDLEWARE ----------

app.use(express.json());

// CORS – allow only your sites, but allow tools like Postman (no origin)
const allowedOrigins = [
  "https://kavplus.uk",
  "https://www.kavplus.uk",
  "https://app.kavplus.uk",
];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true); // Postman, curl, etc.
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
  })
);

// Simple request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ---------- ROUTES ----------

// Health check
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "kavplus-backend-js",
    version: API_VERSION,
    uptime: process.uptime(),
    ts: new Date().toISOString(),
    env: {
      hasLwaClientId: !!process.env.LWA_CLIENT_ID,
      hasLwaClientSecret: !!process.env.LWA_CLIENT_SECRET,
      hasSpapiRefreshToken: !!process.env.SPAPI_REFRESH_TOKEN,
    },
  });
});

// List stores for the dropdown in the dashboard
app.get("/api/stores", (_req, res) => {
  const stores = listStores();
  res.json({ stores });
});

// Exchange stored refresh token -> SP-API access token
// GET /api/token/exchange?store=kav_plus  (or jk, etc.)
app.get("/api/token/exchange", async (req, res) => {
  try {
    const storeId = (req.query.store || "kav_plus").toLowerCase();
    const store = getStoreWithToken(storeId);

    if (!store) {
      return res.status(400).json({
        error: "unknown_store_or_missing_token",
        message: `No refresh token configured for store '${storeId}'.`,
      });
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: store.refreshToken,
      client_id: process.env.LWA_CLIENT_ID,
      client_secret: process.env.LWA_CLIENT_SECRET,
    });

    const response = await fetch("https://api.amazon.com/auth/o2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Token exchange failed:", data);
      return res.status(500).json({
        error: "exchange_failed",
        details: data,
      });
    }

    res.json({
      ok: true,
      store: store.id,
      access_token: data.access_token,
      token_type: data.token_type,
      expires_in: data.expires_in,
      issued_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Unexpected error in /api/token/exchange:", err);
    res.status(500).json({
      error: "server_error",
      message: "Unexpected error while exchanging token.",
    });
  }
});

// Demo ChatKAV+ endpoint (just echoes back for now)
app.post("/chat", (req, res) => {
  const { message, provider = "auto", store = "kav_plus" } = req.body || {};

  if (!message || typeof message !== "string") {
    return res.status(400).json({
      ok: false,
      error: "missing_message",
      message: "Body must contain 'message' as a string.",
    });
  }

  const reply =
    "Demo ChatKAV+ reply: backend is working.\n\n" +
    `• Message: "${message}"\n` +
    `• Provider: ${provider}\n` +
    `• Store: ${store}\n\n` +
    "Next step: plug this into real AI providers (OpenAI, Gemini, etc.).";

  res.json({
    ok: true,
    reply,
    provider: provider === "auto" ? "demo-auto" : provider,
  });
});

// Root
app.get("/", (_req, res) => {
  res.send("Kav+ backend is running. See /health for status.");
});

// ---------- START SERVER ----------
app.listen(port, () => {
  console.log(`KavPlus backend running on ${port}`);
});
