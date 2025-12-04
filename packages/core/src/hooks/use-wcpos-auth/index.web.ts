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

import log from '@wcpos/utils/logger';

import { buildAuthUrl, generateState, getRedirectUri, parseAuthResult } from './utils';

import type { UseWcposAuthReturn, WcposAuthConfig, WcposAuthResult } from './types';

export type { WcposAuthConfig, WcposAuthResult, UseWcposAuthReturn } from './types';

const AUTH_STATE_KEY = 'wcpos_auth_state';
const AUTH_CSRF_STATE_KEY = 'wcpos_auth_csrf_state';

interface SavedAuthState {
	returnPath: string;
	timestamp: number;
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
	return sessionStorage.getItem(AUTH_CSRF_STATE_KEY);
}

export function useWcposAuth(config: WcposAuthConfig): UseWcposAuthReturn {
	const [authResult, setAuthResult] = React.useState<WcposAuthResult | null>(null);

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

	// Try expo-auth-session first (it handles popup/redirect internally)
	const [request, response, expoPromptAsync] = useAuthRequest(
		{
			clientId: 'unused',
			responseType: ResponseType.Token,
			redirectUri,
			extraParams: {
				redirect_uri: redirectUri,
				...config.extraParams,
			},
			scopes: [],
			usePKCE: false,
		},
		discovery
	);

	// Handle expo-auth-session response
	React.useEffect(() => {
		if (!response) return;

		if (response.type === 'success') {
			clearAuthState();
			setAuthResult({
				type: 'success',
				params: response.params as any,
			});
		} else if (response.type === 'error') {
			clearAuthState();
			setAuthResult({
				type: 'error',
				error: response.error?.message || 'Authentication failed',
				errorCode: response.error?.code,
			});
		} else if (response.type === 'dismiss' || response.type === 'cancel') {
			// Don't clear state on dismiss - user might want to retry
			setAuthResult({
				type: response.type,
			});
		} else if (response.type === 'locked') {
			setAuthResult({
				type: 'locked',
			});
		}
	}, [response]);

	// Check URL on mount for auth tokens (handles redirect return)
	React.useEffect(() => {
		// maybeCompleteAuthSession should handle this, but check manually as fallback
		const hash = window.location.hash;
		const search = window.location.search;

		if (hash || search) {
			const urlToCheck = window.location.href;
			if (urlToCheck.includes('access_token') || urlToCheck.includes('error')) {
				log.debug('Detected auth params in URL, parsing...');
				const result = parseAuthResult(urlToCheck);

				// Validate CSRF state for our fallback redirect
				if (result.type === 'success' && result.params) {
					const savedState = getSavedCsrfState();
					const returnedState = result.params.state as unknown as string;

					if (savedState && returnedState !== savedState) {
						log.error('State parameter mismatch - possible CSRF attack');
						setAuthResult({
							type: 'error',
							error: 'State parameter mismatch - authentication rejected for security',
						});
						clearAuthState();
						const cleanUrl = window.location.pathname;
						window.history.replaceState({}, document.title, cleanUrl);
						return;
					}
				}

				if (result.type === 'success' || result.type === 'error') {
					setAuthResult(result);
					clearAuthState();

					// Clean up URL
					const cleanUrl = window.location.pathname;
					window.history.replaceState({}, document.title, cleanUrl);
				}
			}
		}
	}, []);

	const promptAsync = React.useCallback(async (): Promise<WcposAuthResult | void> => {
		if (!request || !config.site) {
			log.warn('Auth not ready');
			return;
		}

		log.debug('Triggering web auth flow');

		/**
		 * Helper to perform fallback redirect with state
		 */
		const doFallbackRedirect = () => {
			const state = generateState();
			const authUrl = buildAuthUrl(
				config.site!.wcpos_login_url,
				redirectUri,
				state,
				config.extraParams
			);
			saveAuthState();
			saveCsrfState(state);
			window.location.href = authUrl;
		};

		try {
			// Try expo-auth-session first
			const result = await expoPromptAsync();

			if (result?.type === 'success') {
				return {
					type: 'success',
					params: result.params as any,
				};
			}

			// If we get here without success and didn't get an explicit error,
			// the popup was likely blocked. Fall back to redirect.
			if (!result || result.type === 'dismiss') {
				log.debug('Popup may have been blocked, falling back to redirect');
				doFallbackRedirect();
				// This won't return - page will navigate away
			}

			return;
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);

			// Check if this is a popup blocked error
			if (errorMessage.includes('Popup window was blocked') || errorMessage.includes('blocked')) {
				log.debug('Popup blocked, falling back to redirect');
				doFallbackRedirect();
				// This won't return - page will navigate away
				return;
			}

			log.error('Auth failed', { context: { error: errorMessage } });

			const errorResult: WcposAuthResult = {
				type: 'error',
				error: errorMessage,
			};
			setAuthResult(errorResult);
			return errorResult;
		}
	}, [request, config.site, config.extraParams, redirectUri, expoPromptAsync]);

	return {
		isReady: !!request,
		response: authResult,
		promptAsync,
	};
}

