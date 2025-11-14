// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { listStores, getStoreWithToken } from "./storeRepo.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// --- health -------------------------------------------------
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    ts: new Date().toISOString(),
  });
});

// --- list stores (for dropdown in dashboard) ----------------
app.get("/api/stores", (req, res) => {
  const stores = listStores();
  res.json({ stores });
});

// --- exchange refresh token -> access token for SP-API ------
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
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
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

// --- start server -------------------------------------------
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`KavPlus backend running on ${port}`);
});
