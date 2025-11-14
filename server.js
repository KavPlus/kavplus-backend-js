// server.js - Kav+ backend API (demo version)
// Make sure you have express installed in package.json:
// "dependencies": { "express": "^4.18.2", "cors": "^2.8.5" }

const express = require("express");
const cors = require("cors");

const app = express();

// ====== CONFIG ======
const PORT = process.env.PORT || 10000;

// Used by frontend and health endpoint
const API_VERSION = "0.1-demo";

// ====== MIDDLEWARE ======
app.use(express.json());

// Allow CORS from your sites
const allowedOrigins = [
  "https://kavplus.uk",
  "https://www.kavplus.uk",
  "https://app.kavplus.uk",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow tools like Postman with no origin
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
  })
);

// Simple logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ====== ROUTES ======

// Health / status endpoint
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "kavplus-backend-js",
    version: API_VERSION,
    time: new Date().toISOString(),
    env: {
      hasOpenAI: !!process.env.OPENAI_API_KEY,
      hasGemini: !!process.env.GEMINI_API_KEY,
      hasAnthropic: !!process.env.ANTHROPIC_API_KEY,
      hasAIMLAPI: !!process.env.AIMLAPI_API_KEY,
    },
  });
});

// Amazon connection endpoints
// For now, we just redirect to URLs you set in environment variables

app.get("/connect/spapi", (req, res) => {
  const store = (req.query.store || "kav_plus").toLowerCase();
  let url;

  if (store === "jk_store" || store === "j&k" || store === "j_k") {
    url = process.env.CONNECT_SPAPI_URL_JK;
  } else {
    url = process.env.CONNECT_SPAPI_URL_KAVPLUS;
  }

  if (!url) {
    return res.status(500).json({
      ok: false,
      message:
        "CONNECT_SPAPI_URL_KAVPLUS / CONNECT_SPAPI_URL_JK not set on server.",
    });
  }

  return res.redirect(url);
});

app.get("/connect/ads", (req, res) => {
  const store = (req.query.store || "kav_plus").toLowerCase();
  let url;

  if (store === "jk_store" || store === "j&k" || store === "j_k") {
    url = process.env.CONNECT_ADS_URL_JK;
  } else {
    url = process.env.CONNECT_ADS_URL_KAVPLUS;
  }

  if (!url) {
    return res.status(500).json({
      ok: false,
      message:
        "CONNECT_ADS_URL_KAVPLUS / CONNECT_ADS_URL_JK not set on server.",
    });
  }

  return res.redirect(url);
});

// ChatKAV+ demo endpoint
// Later we can upgrade this to real OpenAI / Gemini calls.

app.post("/chat", async (req, res) => {
  try {
    const { message, provider = "auto", store = "kav_plus" } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Missing 'message' in body",
      });
    }

    // DEMO BEHAVIOUR:
    // Just echo back with some context so you know everything is wired correctly.
    const reply =
      "Demo ChatKAV+ reply: I received your message and the backend is working.\n\n" +
      `• Message: "${message}"\n` +
      `• Requested provider: ${provider}\n` +
      `• Active store: ${store}\n\n` +
      "In the next step, we can plug this into real AI providers (OpenAI, Gemini, etc.) using your API keys.";

    return res.json({
      ok: true,
      reply,
      provider: provider === "auto" ? "demo-auto" : provider,
    });
  } catch (err) {
    console.error("Chat error:", err);
    return res.status(500).json({
      ok: false,
      error: "Internal server error",
    });
  }
});

// Root (optional)
app.get("/", (_req, res) => {
  res.send("Kav+ backend is running. See /health for status.");
});

// ====== START SERVER ======
app.listen(PORT, () => {
  console.log(`Kav+ backend listening on port ${PORT}`);
});
