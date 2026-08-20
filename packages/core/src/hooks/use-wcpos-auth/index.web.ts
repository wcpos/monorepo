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
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import {
	captureRedirectResult,
	claimRedirectResult,
	clearRedirectState,
	saveRedirectState,
} from './redirect-result';
import { buildAuthUrl, generateState, getRedirectUri } from './utils';

import type { UseWcposAuthReturn, WcposAuthConfig, WcposAuthResult } from './types';

const oauthLogger = getLogger(['wcpos', 'auth', 'oauth']);

export type { WcposAuthConfig, WcposAuthResult, UseWcposAuthReturn } from './types';

/**
 * Navigate to URL - extracted to avoid React Compiler warning about
 * writing to variables outside the component
 */
function navigateToUrl(url: string): void {
	window.location.href = url;
}

export function useWcposAuth(config: WcposAuthConfig): UseWcposAuthReturn {
	// Holds the redirect-return result once this instance claims it, and any
	// error raised while launching the prompt.
	const [imperativeResult, setImperativeResult] = React.useState<WcposAuthResult | null>(null);

	const loginUrl = config.site?.wcpos_login_url ?? null;

	// Capture the redirect return on the first mount of any instance (parses,
	// CSRF-validates, and strips the URL exactly once per page load), then claim
	// the result for this instance's site. Claiming happens in an effect — not a
	// render-time initializer — so a render discarded by Suspense can't consume
	// the one-shot result. The consumer for the initiating site typically mounts
	// long after the first instances, so the claim has to survive until then.
	React.useEffect(() => {
		captureRedirectResult();
		const pendingResult = claimRedirectResult(loginUrl, config.claimKey);
		if (pendingResult) {
			// eslint-disable-next-line react-hooks/set-state-in-effect -- claiming consumes a one-shot external store (the parsed redirect URL); it must happen post-commit, never during render, so a Suspense-discarded render can't eat the token.
			setImperativeResult(pendingResult);
		}
	}, [loginUrl, config.claimKey]);

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

	// A live response supersedes the claimed redirect-return/prompt result.
	const authResult = responseResult ?? imperativeResult;

	// Clear saved auth state once a live response resolves successfully or errors.
	React.useEffect(() => {
		if (response && (response.type === 'success' || response.type === 'error')) {
			clearRedirectState();
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
			saveRedirectState(config.site!.wcpos_login_url, state, config.claimKey);
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
			const errorMessage = getErrorMessage(err);
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

			oauthLogger.error('Auth failed', {
				code: ERROR_CODES.AUTH_UNEXPECTED,
				context: { error: errorMessage },
			});

			const errorResult: WcposAuthResult = {
				type: 'error',
				error: errorMessage,
			};
			setImperativeResult(errorResult);
			return errorResult;
		}
	}, [request, config.site, config.claimKey, mergedExtraParams, redirectUri, expoPromptAsync]);

	return {
		isReady: !!request,
		response: authResult,
		promptAsync,
	};
}
