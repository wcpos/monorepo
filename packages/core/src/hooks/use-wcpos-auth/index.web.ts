/**
 * Web implementation of useWcposAuth
 * Uses same-window redirect since popups are blocked and iframes have issues
 *
 * Flow:
 * 1. Save current state to sessionStorage
 * 2. Redirect to auth URL
 * 3. Auth server redirects back with tokens
 * 4. On app load, check URL for tokens and restore state
 *
 * Note: expo-auth-session already handles most of this via maybeCompleteAuthSession()
 * This implementation uses expo-auth-session under the hood but provides
 * a fallback redirect mechanism if popups fail.
 */
import * as React from 'react';

import { ResponseType, useAuthRequest } from 'expo-auth-session';

import { AppInfo } from '@wcpos/utils/app-info';
import { getLogger } from '@wcpos/utils/logger';

import { buildAuthUrl, generateState, getRedirectUri, parseAuthResult } from './utils';

import type { UseWcposAuthReturn, WcposAuthConfig, WcposAuthResult } from './types';

const oauthLogger = getLogger(['wcpos', 'auth', 'oauth']);

export type { WcposAuthConfig, WcposAuthResult, UseWcposAuthReturn } from './types';

const AUTH_STATE_KEY = 'wcpos_auth_state';
const AUTH_CSRF_STATE_KEY = 'wcpos_auth_csrf_state';

/**
 * Navigate to URL - extracted to avoid React Compiler warning about
 * writing to variables outside the component
 */
function navigateToUrl(url: string): void {
	window.location.href = url;
}

interface SavedAuthState {
	returnPath: string;
	timestamp: number;
}

function getSavedAuthState(): SavedAuthState | null {
	if (typeof sessionStorage === 'undefined') return null;

	const raw = sessionStorage.getItem(AUTH_STATE_KEY);
	if (!raw) return null;

	try {
		return JSON.parse(raw) as SavedAuthState;
	} catch {
		return null;
	}
}

/**
 * Save current location before redirecting
 */
function saveAuthState(): void {
	const state: SavedAuthState = {
		returnPath: window.location.pathname + window.location.search,
		timestamp: Date.now(),
	};
	sessionStorage.setItem(AUTH_STATE_KEY, JSON.stringify(state));
}

/**
 * Clear saved auth state
 */
function clearAuthState(): void {
	sessionStorage.removeItem(AUTH_STATE_KEY);
	sessionStorage.removeItem(AUTH_CSRF_STATE_KEY);
}

/**
 * Save CSRF state before redirect
 */
function saveCsrfState(state: string): void {
	sessionStorage.setItem(AUTH_CSRF_STATE_KEY, state);
}

/**
 * Get saved CSRF state
 */
function getSavedCsrfState(): string | null {
	if (typeof sessionStorage === 'undefined') return null;
	return sessionStorage.getItem(AUTH_CSRF_STATE_KEY);
}

/**
 * Result of inspecting the URL for auth tokens (redirect-return fallback).
 * Computed synchronously from window.location so it can seed initial state.
 */
function parseAuthFromUrl(): WcposAuthResult | null {
	if (typeof window === 'undefined') return null;

	const hash = window.location.hash;
	const search = window.location.search;

	if (!hash && !search) return null;

	const urlToCheck = window.location.href;
	if (!urlToCheck.includes('access_token') && !urlToCheck.includes('error')) {
		return null;
	}

	oauthLogger.debug('Detected auth params in URL, parsing...');
	const result = parseAuthResult(urlToCheck);

	// Validate CSRF state for our fallback redirect
	if (result.type === 'success' && result.params) {
		const savedState = getSavedCsrfState();
		const returnedState = (result.params as unknown as Record<string, unknown>)?.state as
			string | undefined;

		if (savedState && returnedState !== savedState) {
			oauthLogger.error('State parameter mismatch - possible CSRF attack');
			return {
				type: 'error',
				error: 'State parameter mismatch - authentication rejected for security',
			};
		}
	}

	if (result.type === 'success' || result.type === 'error') {
		return result;
	}

	return null;
}

export function useWcposAuth(config: WcposAuthConfig): UseWcposAuthReturn {
	// Seed state once from the URL (redirect-return fallback) and from any error
	// raised while launching the prompt. Both are set outside of effects.
	const [imperativeResult, setImperativeResult] = React.useState<WcposAuthResult | null>(() =>
		parseAuthFromUrl()
	);

	const redirectUri = React.useMemo(() => getRedirectUri(), []);

	// Setup OAuth discovery
	const discovery = React.useMemo(
		() =>
			config.site
				? {
						authorizationEndpoint: config.site.wcpos_login_url,
					}
				: null,
		[config.site]
	);

	// Merge app info with user-provided extraParams
	const mergedExtraParams = React.useMemo(
		() => ({
			platform: AppInfo.platform,
			version: AppInfo.version,
			build: AppInfo.buildNumber,
			...config.extraParams,
		}),
		[config.extraParams]
	);

	// Try expo-auth-session first (it handles popup/redirect internally)
	const [request, response, expoPromptAsync] = useAuthRequest(
		{
			clientId: 'unused',
			responseType: ResponseType.Token,
			redirectUri,
			extraParams: {
				redirect_uri: redirectUri,
				...mergedExtraParams,
			},
			scopes: [],
			usePKCE: false,
		},
		discovery
	);

	// Convert expo-auth-session response to our unified format. Derived during
	// render from `response` instead of mirrored into state via an effect.
	const responseResult = React.useMemo<WcposAuthResult | null>(() => {
		if (!response) return null;

		if (response.type === 'success') {
			return {
				type: 'success',
				params: response.params as any,
			};
		}
		if (response.type === 'error') {
			return {
				type: 'error',
				error: response.error?.message || 'Authentication failed',
				errorCode: response.error?.code,
			};
		}
		if (response.type === 'dismiss' || response.type === 'cancel') {
			return {
				type: response.type,
			};
		}
		if (response.type === 'locked') {
			return {
				type: 'locked',
			};
		}
		return null;
	}, [response]);

	// A live response supersedes the seeded URL/prompt result.
	const authResult = responseResult ?? imperativeResult;

	/**
	 * Mount-only side effects. State seeding for both the URL fallback and the
	 * response mapping happens during render (above); this effect only performs
	 * the imperative cleanup that must run once: clearing saved auth state and
	 * stripping auth params from the URL. Runs once on mount.
	 */
	React.useEffect(() => {
		const urlResult = parseAuthFromUrl();
		if (urlResult && (urlResult.type === 'success' || urlResult.type === 'error')) {
			const cleanUrl = getSavedAuthState()?.returnPath ?? window.location.pathname;
			clearAuthState();
			window.history.replaceState({}, document.title, cleanUrl);
		}
	}, []);

	// Clear saved auth state once a live response resolves successfully or errors.
	React.useEffect(() => {
		if (response && (response.type === 'success' || response.type === 'error')) {
			clearAuthState();
		}
	}, [response]);

	const promptAsync = React.useCallback(async (): Promise<WcposAuthResult | void> => {
		if (!request || !config.site) {
			oauthLogger.warn('Auth not ready', {
				context: { hasRequest: !!request, hasSite: !!config.site },
			});
			return;
		}

		setImperativeResult(null);

		oauthLogger.debug('Triggering web auth flow', {
			context: {
				loginUrl: config.site.wcpos_login_url,
				redirectUri,
			},
		});

		/**
		 * Helper to perform fallback redirect with state
		 */
		const doFallbackRedirect = () => {
			oauthLogger.debug('Performing fallback redirect');
			const state = generateState();
			const authUrl = buildAuthUrl(
				config.site!.wcpos_login_url,
				redirectUri,
				state,
				mergedExtraParams
			);
			saveAuthState();
			saveCsrfState(state);
			oauthLogger.debug('Redirecting to auth URL', { context: { authUrl } });
			navigateToUrl(authUrl);
		};

		try {
			oauthLogger.debug('Calling expoPromptAsync...');
			// Try expo-auth-session first
			const result = await expoPromptAsync();

			oauthLogger.debug('expoPromptAsync returned', {
				context: {
					resultType: result?.type,
					hasParams: !!(result as { params?: unknown })?.params,
				},
			});

			if (result?.type === 'success') {
				return {
					type: 'success',
					params: result.params as any,
				};
			}

			// If we get here without success and didn't get an explicit error,
			// the popup was likely blocked. Fall back to redirect.
			if (!result || result.type === 'dismiss') {
				oauthLogger.debug('Popup may have been blocked or dismissed, falling back to redirect');
				doFallbackRedirect();
				// This won't return - page will navigate away
			}

			return;
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			oauthLogger.debug('expoPromptAsync threw error', {
				context: { error: errorMessage },
			});

			// Check if this is a popup blocked error
			if (errorMessage.includes('Popup window was blocked') || errorMessage.includes('blocked')) {
				oauthLogger.debug('Popup blocked, falling back to redirect');
				doFallbackRedirect();
				// This won't return - page will navigate away
				return;
			}

			oauthLogger.error('Auth failed', { context: { error: errorMessage } });

			const errorResult: WcposAuthResult = {
				type: 'error',
				error: errorMessage,
			};
			setImperativeResult(errorResult);
			return errorResult;
		}
	}, [request, config.site, mergedExtraParams, redirectUri, expoPromptAsync]);

	return {
		isReady: !!request,
		response: authResult,
		promptAsync,
	};
}
