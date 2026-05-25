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
			await promptAsync();
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
