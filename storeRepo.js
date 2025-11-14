// storeRepo.js
// Helper for reading stores.json and exposing helper functions.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storesPath = path.join(__dirname, "stores.json");
const stores = JSON.parse(fs.readFileSync(storesPath, "utf8"));

export function listStores() {
  // Only share safe info to the frontend (no tokens)
  return stores.map((s) => ({
    key: s.id,
    label: s.name,
  }));
}

export function getStoreWithToken(id) {
  if (!id) return null;
  const key = id.toLowerCase();
  return stores.find((s) => s.id.toLowerCase() === key) || null;
}
