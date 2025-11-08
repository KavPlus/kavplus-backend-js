// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// ---- CORS: allow your two sites + local dev ----
const allowlist = [
  process.env.APP_BASE_URL,          // e.g. https://app.kavplus.uk
  process.env.API_BASE_URL,          // e.g. https://api.kavplus.uk (for tools that call from API host)
  "https://kavplus.uk",
  "http://localhost:5173",           // vite dev (optional)
  "http://localhost:3000"            // local dev (optional)
].filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    // allow non-browser/server-to-server and allowed origins
    if (!origin || allowlist.some(o => origin === o)) return cb(null, true);
    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true
}));

// ------------- Health + root -------------
app.get("/", (_req, res) => {
  res.send("KavPlus Backend Running 🚀");
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// ------------- AI broker -------------
/**
 * POST /ai/chat
 * body: { provider?: "auto"|"aimlapi"|"openai"|"anthropic"|"gemini", model?: string, messages: [{role, content}] }
 * returns: { text, provider, model }
 *
 * Order for provider: auto -> AIMLAPI -> OpenAI -> Anthropic -> Gemini
 */
app.post("/ai/chat", async (req, res) => {
  try {
    const { provider = "auto", model, messages = [] } = req.body || {};

    // Pick provider
    const pick = () => {
      if (provider !== "auto") return provider;
      if (process.env.AIMLAPI_API_KEY) return "aimlapi";
      if (process.env.OPENAI_API_KEY)  return "openai";
      if (process.env.ANTHROPIC_API_KEY) return "anthropic";
      if (process.env.GEMINI_API_KEY)  return "gemini";
      return null;
    };
    const chosen = pick();
    if (!chosen) {
      return res.status(400).json({ error: "No AI provider keys present. Add one of AIMLAPI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY." });
    }

    const out = await routeToProvider(chosen, { model, messages });
    return res.json({ provider: chosen, ...out });
  } catch (err) {
    console.error("AI error:", err);
    return res.status(500).json({ error: "AI request failed", detail: String(err?.message || err) });
  }
});

// ---- provider router ----
async function routeToProvider(provider, { model, messages }) {
  switch (provider) {
    case "aimlapi":
      // https://aimlapi.com proxy for multiple models
      return aimlapiChat({
        model: model || process.env.AIMLAPI_BASE || "openai/gpt-4o-mini",
        key: process.env.AIMLAPI_API_KEY,
        messages
      });
    case "openai":
      return openaiChat({
        model: model || "gpt-4o-mini",
        key: process.env.OPENAI_API_KEY,
        messages
      });
    case "anthropic":
      return anthropicChat({
        model: model || "claude-3-haiku-20240307",
        key: process.env.ANTHROPIC_API_KEY,
        messages
      });
    case "gemini":
      return geminiChat({
        model: model || "models/gemini-1.5-flash",
        key: process.env.GEMINI_API_KEY,
        messages
      });
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// ---------- Providers ----------
async function aimlapiChat({ model, key, messages }) {
  const r = await fetch("https://api.aimlapi.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model, messages, temperature: 0.7 })
  });
  if (!r.ok) throw new Error(`AIMLAPI ${r.status}`);
  const data = await r.json();
  const text = data?.choices?.[0]?.message?.content || "";
  return { model, text };
}

async function openaiChat({ model, key, messages }) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model, messages, temperature: 0.7 })
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}`);
  const data = await r.json();
  const text = data?.choices?.[0]?.message?.content || "";
  return { model, text };
}

async function anthropicChat({ model, key, messages }) {
  // Anthropic expects a different message shape (content array)
  const systemMsg = messages.find(m => m.role === "system")?.content || undefined;
  const userMsgs = messages.filter(m => m.role !== "system").map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: [{ type: "text", text: m.content }]
  }));

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: systemMsg,
      messages: userMsgs
    })
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}`);
  const data = await r.json();
  const text = data?.content?.[0]?.text || "";
  return { model, text };
}

async function geminiChat({ model, key, messages }) {
  // Simple mapping: concatenate conversation into prompt for a single-turn call
  const prompt = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n");
  const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${key}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}`);
  const data = await r.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return { model, text };
}

// ------------- start -------------
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`✅ Server running on port ${port}`));
