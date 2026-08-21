// Refresh must fail fast so the 401 retry path can settle; 15s matches the auth-discovery flows.
export const REFRESH_TIMEOUT_MS = 15_000;
