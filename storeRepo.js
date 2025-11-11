// storeRepo.js
import fs from 'fs/promises';
import path from 'path';
const STORES_PATH = path.join(process.cwd(), 'stores.json');

export async function getStores() {
  try { return JSON.parse(await fs.readFile(STORES_PATH, 'utf8')); }
  catch { return []; }
}

export async function getStore(key) {
  const list = await getStores();
  return list.find(s => s.key === key) || null;
}

export async function saveStore(store) {
  const list = await getStores();
  const i = list.findIndex(s => s.key === store.key);
  if (i === -1) list.push(store);
  else list[i] = store;
  await fs.writeFile(STORES_PATH, JSON.stringify(list, null, 2));
}

export async function setSpapiRefreshToken(storeKey, refreshToken, region='eu') {
  const list = await getStores();
  const i = list.findIndex(s => s.key === storeKey);
  if (i === -1) throw new Error(`Unknown store: ${storeKey}`);
  list[i].spapi = { ...(list[i].spapi||{}), refresh_token: refreshToken, region };
  await fs.writeFile(STORES_PATH, JSON.stringify(list, null, 2));
}
