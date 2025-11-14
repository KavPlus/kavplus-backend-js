// server.js - Kav+ backend API (multistore demo)

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { listStores, getStoreWithToken } from "./storeRepo.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_VERSION = "0.2-multistore-demo";

// ---------- MIDDLEWARE ----------
const allowedOrigins = [
  "https://kavplus.uk",
  "https://www.kavplus.uk",
  "https://app.kavplus.uk",
];

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // Postman, curl etc.
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
  })
);

app.use(express.json());

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ---------- ROUTES ----------

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "kavplus-backend-js",
    version: API_VERSION,
    uptime: process.uptime(),
    ts: new Date().toISOString(),
  });
});

// List stores for dropdown
app.get("/api/stores", (_req, res) => {
  res.json(listStores());
});

// Exchange SP-API refresh token -> access token
app.get("/api/token/exchange", async (req, res) => {
  try {
    const storeId = (req.query.store || "").toLowerCase();
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

    return res.json({
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

// Root
app.get("/", (_req, res) => {
  res.send("Kav+ backend is running. See /health for status.");
});

// ---------- START ----------
app.listen(PORT, () => {
  console.log(`KavPlus backend running on ${PORT}`);
});
