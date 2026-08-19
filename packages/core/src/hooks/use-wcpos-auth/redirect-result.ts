/**
 * Redirect-return fallback result handling (web only).
 *
 * When the login popup is blocked, promptAsync() navigates the whole window to
 * the auth server; the server 302s back with tokens in the query string and
 * the app reloads. Many useWcposAuth instances mount during that reload — some
 * early (before the Sites screen's Suspense resolves), the actual consumer for
 * the initiating site up to seconds later. Per-instance URL parsing loses the
 * token: the first instance's cleanup strips the URL before the consumer ever
 * sees it.
 *
 * This module is the single owner of the redirect return. The URL is parsed,
 * CSRF-validated, and stripped from the address bar exactly once per page
 * load; the result is held in module memory (never re-persisted, so tokens
 * don't outlive the page) until the hook instance configured for the
 * initiating site claims it. Claims are one-shot: with several consumers for
 * the same site mounted (WpUser rows and AddUserButton), only the first
 * matching claimant processes the login — mirroring the popup path, where only
 * the prompting instance receives a response.
 */
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { extractAuthParams, parseAuthResult } from './utils';

import type { WcposAuthResult } from './types';

const oauthLogger = getLogger(['wcpos', 'auth', 'oauth']);

const AUTH_STATE_KEY = 'wcpos_auth_state';
const AUTH_CSRF_STATE_KEY = 'wcpos_auth_csrf_state';

interface SavedRedirectState {
	returnPath: string;
	/** wcpos_login_url of the site that initiated the redirect */
	loginUrl?: string;
	timestamp: number;
}

interface PendingRedirectResult {
	/** null when the saved state was missing, i.e. the initiating site is unknown */
	loginUrl: string | null;
	result: WcposAuthResult;
}

let captured = false;
let pending: PendingRedirectResult | null = null;

/**
 * Save the return location, initiating site, and CSRF state before the
 * fallback redirect navigates away.
 */
export function saveRedirectState(loginUrl: string, csrfState: string): void {
	if (typeof sessionStorage === 'undefined') return;

	const state: SavedRedirectState = {
		returnPath: window.location.pathname + window.location.search,
		loginUrl,
		timestamp: Date.now(),
	};
	sessionStorage.setItem(AUTH_STATE_KEY, JSON.stringify(state));
	sessionStorage.setItem(AUTH_CSRF_STATE_KEY, csrfState);
}

/**
 * Clear saved redirect state (also used once a live popup response resolves,
 * so a leftover fallback save can't affect a later page load).
 */
export function clearRedirectState(): void {
	if (typeof sessionStorage === 'undefined') return;

	sessionStorage.removeItem(AUTH_STATE_KEY);
	sessionStorage.removeItem(AUTH_CSRF_STATE_KEY);
}

function getSavedRedirectState(): SavedRedirectState | null {
	if (typeof sessionStorage === 'undefined') return null;

	const raw = sessionStorage.getItem(AUTH_STATE_KEY);
	if (!raw) return null;

	try {
		return JSON.parse(raw) as SavedRedirectState;
	} catch {
		return null;
	}
}

function getSavedCsrfState(): string | null {
	if (typeof sessionStorage === 'undefined') return null;
	return sessionStorage.getItem(AUTH_CSRF_STATE_KEY);
}

/**
 * Inspect the URL for a redirect-return auth result. Runs at most once per
 * page load: reads the saved CSRF state before anything can clear it,
 * validates, then strips the auth params from the address bar and clears the
 * saved state. Idempotent — safe to call from every hook mount.
 */
export function captureRedirectResult(): void {
	if (captured) return;
	captured = true;

	if (typeof window === 'undefined') return;

	const { hash, search } = window.location;
	if (!hash && !search) return;

	const url = window.location.href;
	if (!url.includes('access_token') && !url.includes('error')) return;

	oauthLogger.debug('Detected auth params in URL, parsing...');
	const saved = getSavedRedirectState();
	const savedCsrf = getSavedCsrfState();
	let result = parseAuthResult(url);

	// Validate CSRF state against the raw URL param. (WcposAuthParams doesn't
	// carry `state`, so the comparison must read the URL, not result.params.)
	if (result.type === 'success') {
		const returnedState = extractAuthParams(url)?.get('state') ?? null;
		if (savedCsrf && returnedState !== savedCsrf) {
			oauthLogger.error('State parameter mismatch - possible CSRF attack', {
				code: ERROR_CODES.AUTH_UNEXPECTED,
				context: {
					savedStatePrefix: savedCsrf.slice(0, 8),
					returnedStatePrefix: returnedState ? returnedState.slice(0, 8) : '(missing)',
				},
			});
			result = {
				type: 'error',
				error: 'State parameter mismatch - authentication rejected for security',
			};
		}
	}

	if (result.type !== 'success' && result.type !== 'error') return;

	// Strip tokens from the address bar and clear the saved state exactly once.
	const cleanUrl = saved?.returnPath ?? window.location.pathname;
	clearRedirectState();
	window.history.replaceState({}, document.title, cleanUrl);

	pending = { loginUrl: saved?.loginUrl ?? null, result };
}

/**
 * Claim the pending redirect result for a site. One-shot: the first matching
 * claimant consumes it. A pending result keyed to a site is only handed to a
 * consumer configured with the same wcpos_login_url; a result with an unknown
 * initiating site goes to the first consumer that has any site configured.
 */
export function claimRedirectResult(loginUrl: string | null | undefined): WcposAuthResult | null {
	captureRedirectResult();

	if (!pending) return null;
	// A consumer without a configured site can't own a login result.
	if (!loginUrl) return null;
	if (pending.loginUrl && pending.loginUrl !== loginUrl) return null;

	const { result } = pending;
	pending = null;
	return result;
}

/**
 * Test-only: reset module state between tests.
 */
export function __resetRedirectResultForTesting(): void {
	captured = false;
	pending = null;
}
