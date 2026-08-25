/**
 * `fetch`, but over the main process — the web/native default.
 *
 * On web and React Native there is no IPC seam and no custom-scheme origin, so
 * the platform's own fetch IS the correct transport: on web CORS applies to the
 * app exactly as it applies to any page, and on native it does not apply at all.
 * Electron resolves `platform-fetch.electron.ts` instead, which crosses the
 * `http-request` bridge and is therefore not subject to CORS at all.
 *
 * Callers use this instead of a bare `fetch()` so the platform decision lives in
 * one place rather than being re-made at every call site — which is exactly how
 * the 1.10.2 connect outage happened.
 *
 * This is the one authorized raw-fetch site in the app: this module IS the
 * platform decision, so the guard that sends everyone here has nothing to say.
 */

export const platformFetch: typeof globalThis.fetch = (input, init) => fetch(input, init);
