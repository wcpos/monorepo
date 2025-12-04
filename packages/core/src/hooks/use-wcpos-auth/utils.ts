import { makeRedirectUri } from 'expo-auth-session';

import type { WcposAuthParams, WcposAuthResult } from './types';

/**
 * Get the redirect URI for auth callbacks
 */
export function getRedirectUri(): string {
	return makeRedirectUri({
		scheme: 'wcpos',
		path: (window as any)?.baseUrl ?? undefined,
	});
}

/**
 * Generate a cryptographically secure random state parameter
 * Used for CSRF protection in OAuth flows
 */
export function generateState(): string {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Build the full auth URL with all required parameters
 */
export function buildAuthUrl(
	authEndpoint: string,
	redirectUri: string,
	state: string,
	extraParams?: Record<string, string>
): string {
	const url = new URL(authEndpoint);
	url.searchParams.set('redirect_uri', redirectUri);
	url.searchParams.set('state', state);

	if (extraParams) {
		Object.entries(extraParams).forEach(([key, value]) => {
			url.searchParams.set(key, value);
		});
	}

	return url.toString();
}

/**
 * Parse auth tokens from a redirect URL
 * Supports both query params and hash fragments
 */
export function parseAuthResult(url: string): WcposAuthResult {
	try {
		const urlObj = new URL(url);

		// Try query params first, then hash fragment
		let params: URLSearchParams;
		if (urlObj.search) {
			params = urlObj.searchParams;
		} else if (urlObj.hash) {
			// Remove leading # and parse
			params = new URLSearchParams(urlObj.hash.slice(1));
		} else {
			return {
				type: 'error',
				error: 'No auth parameters found in URL',
			};
		}

		// Check for error response
		const error = params.get('error');
		if (error) {
			return {
				type: 'error',
				error: params.get('error_description') || error,
				errorCode: error,
			};
		}

		// Extract tokens
		const accessToken = params.get('access_token');
		const refreshToken = params.get('refresh_token');
		const uuid = params.get('uuid');
		const id = params.get('id');
		const displayName = params.get('display_name');
		const expiresAt = params.get('expires_at');

		if (!accessToken || !refreshToken || !uuid) {
			return {
				type: 'error',
				error: 'Missing required auth parameters',
			};
		}

		const authParams: WcposAuthParams = {
			access_token: accessToken,
			refresh_token: refreshToken,
			uuid,
			id: id || '',
			display_name: displayName || '',
			expires_at: expiresAt ? parseInt(expiresAt, 10) : 0,
			token_type: params.get('token_type') || 'Bearer',
		};

		return {
			type: 'success',
			params: authParams,
		};
	} catch (err) {
		return {
			type: 'error',
			error: err instanceof Error ? err.message : 'Failed to parse auth URL',
		};
	}
}

