/**
 * Native implementation of useWcposAuth
 * Uses expo-auth-session directly (works well on iOS/Android)
 */
import * as React from 'react';

import { ResponseType, useAuthRequest } from 'expo-auth-session';

import { AppInfo } from '@wcpos/utils/app-info';

import { getRedirectUri } from './utils';

import type { UseWcposAuthReturn, WcposAuthConfig, WcposAuthResult } from './types';

export type { WcposAuthConfig, WcposAuthResult, UseWcposAuthReturn } from './types';

/**
 * Creates the native OAuth flow for a WCPOS site.
 */
export function useWcposAuth(config: WcposAuthConfig): UseWcposAuthReturn {
	// Imperative error captured when promptAsync() throws before producing a
	// response (e.g. the request could not be launched). Set in the handler, not
	// in an effect.
	const [promptError, setPromptError] = React.useState<WcposAuthResult | null>(null);

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

	// Setup OAuth request using expo-auth-session
	const [request, response, promptAsync] = useAuthRequest(
		{
			clientId: 'unused', // expo requires this field
			responseType: ResponseType.Token,
			redirectUri,
			extraParams: {
				redirect_uri: redirectUri,
				platform: AppInfo.platform,
				version: AppInfo.version,
				build: AppInfo.buildNumber,
				...config.extraParams,
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

	// A real response always supersedes a previous prompt-launch error.
	const authResult = responseResult ?? promptError;

	// Wrapper around promptAsync to match our interface
	const handlePromptAsync = React.useCallback(async () => {
		if (!request) {
			return;
		}
		// Clear any stale prompt error before retrying.
		setPromptError(null);
		try {
			// createTask: false — the Android Custom Tab must live in the APP's
			// task, not its own. The default (true) spawns a second task under
			// the app's package; after login both tasks sit in recents, and a
			// later launch (app icon, or E2E launchApp) can raise the BROWSER
			// task — a dead login page over a healthy, logged-in app. Observed
			// three times on the native suite (runs 33176268259 tablet flow 03,
			// 33196506511 phone flow 06 + tablet flow 04, screenshots in the
			// maestro artifacts): the tab resurrects on relaunch. In-task, the
			// redirect dismissal removes it from the back stack for good.
			// No-op on iOS (ASWebAuthenticationSession has no tasks).
			await promptAsync({ createTask: false });
		} catch (err) {
			setPromptError({
				type: 'error',
				error: err instanceof Error ? err.message : 'Authentication failed',
			});
		}
	}, [request, promptAsync]);

	return {
		isReady: !!request,
		response: authResult,
		promptAsync: handlePromptAsync,
	};
}
