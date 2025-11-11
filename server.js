import express from "express";
import fetch from "node-fetch";
import { getStores, getStore, setSpapiRefreshToken } from "./storeRepo.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.send("KavPlus Backend Running 🚀"));
app.get("/health", (req, res) =>
  res.json({ status: "ok", uptime: process.uptime(), ts: new Date().toISOString() })
);

// --- Multi-store routes ---
app.get("/api/stores", async (req, res) => {
  const list = await getStores();
  res.json(list.map(({ key, label }) => ({ key, label })));
});

app.get("/api/status", async (req, res) => {
  const list = await getStores();
  res.json({
    api: { base: process.env.API_BASE_URL, ok: true },
    stores: list.map(s => ({
      key: s.key,
      label: s.label,
      spapiConnected: !!(s.spapi && s.spapi.refresh_token),
      adsConnected: !!(s.ads && s.ads.refresh_token)
    })),
    timestamp: new Date().toISOString()
  });
});

app.get("/api/connect/spapi/:store", async (req, res) => {
  const storeKey = req.params.store;
  const store = await getStore(storeKey);
  if (!store) return res.status(404).send("Unknown store");

  const clientId = process.env.LWA_CLIENT_ID;
  const redirectUri = `${process.env.API_BASE_URL}/api/callback/spapi`;
  const scope = encodeURIComponent("sellingpartnerapi::migration"); // <-- fixed
  const state = encodeURIComponent(JSON.stringify({ t: "spapi", store: storeKey }));

  const authUrl =
    `https://www.amazon.com/ap/oa?client_id=${clientId}` +
    `&scope=${scope}%20offline_access` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`;

  res.redirect(authUrl);
});

app.get("/api/callback/spapi", async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) return res.status(400).send("Missing code/state");

    const parsed = JSON.parse(state);
    if (parsed.t !== "spapi" || !parsed.store)
      return res.status(400).send("Bad state");
    const storeKey = parsed.store;

    const tokenRes = await fetch("https://api.amazon.com/auth/o2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: process.env.LWA_CLIENT_ID,
        client_secret: process.env.LWA_CLIENT_SECRET,
        redirect_uri: `${process.env.API_BASE_URL}/api/callback/spapi`
      })
    }).then(r => r.json());

    if (!tokenRes.refresh_token) {
      console.error("LWA token exchange failed:", tokenRes);
      return res.status(500).send("Token exchange failed");
    }

    await setSpapiRefreshToken(storeKey, tokenRes.refresh_token, "eu");
    res.redirect(`${process.env.APP_BASE_URL}/dashboard?connected=${storeKey}`);
  } catch (e) {
    console.error(e);
    res.status(500).send("Callback failed");
  }
});

// Old short paths
app.get("/connect/spapi", (req, res) => res.redirect("/api/connect/spapi/kavplus"));
app.get("/connect/ads", (req, res) => res.redirect("/api/connect/ads/kavplus"));

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
