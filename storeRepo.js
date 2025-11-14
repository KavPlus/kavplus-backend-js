// storeRepo.js
import stores from "./stores.json" assert { type: "json" };

// Return list of stores *without* secrets
export function listStores() {
  return stores.map(({ id, name }) => ({ id, name }));
}

// Get a store + its refresh token from env
export function getStoreWithToken(storeId) {
  const store = stores.find((s) => s.id === storeId);
  if (!store) return null;

  // Env var pattern: SPAPI_REFRESH_TOKEN_<UPPERCASE_ID>
  const envKey = `SPAPI_REFRESH_TOKEN_${storeId.toUpperCase()}`;
  const refreshToken = process.env[envKey];

  if (!refreshToken) {
    return null;
  }

  return {
    ...store,
    refreshToken,
  };
}
