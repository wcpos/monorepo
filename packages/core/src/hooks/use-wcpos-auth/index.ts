/**
 * Native implementation of useWcposAuth
 * Uses expo-auth-session directly (works well on iOS/Android)
 */
import * as React from 'react';

import { ResponseType, useAuthRequest } from 'expo-auth-session';

import AppInfo from '@wcpos/utils/app-info';

import { getRedirectUri } from './utils';

import type { UseWcposAuthReturn, WcposAuthConfig, WcposAuthResult } from './types';

export type { WcposAuthConfig, WcposAuthResult, UseWcposAuthReturn } from './types';

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

	// Convert expo-auth-session response to our unified format
	React.useEffect(() => {
		if (!response) return;

		if (response.type === 'success') {
			setAuthResult({
				type: 'success',
				params: response.params as any,
			});
		} else if (response.type === 'error') {
			setAuthResult({
				type: 'error',
				error: response.error?.message || 'Authentication failed',
				errorCode: response.error?.code,
			});
		} else if (response.type === 'dismiss' || response.type === 'cancel') {
			setAuthResult({
				type: response.type,
			});
		} else if (response.type === 'locked') {
			setAuthResult({
				type: 'locked',
			});
		}
	}, [response]);

	// Wrapper around promptAsync to match our interface
	const handlePromptAsync = React.useCallback(async () => {
		if (!request) {
			return;
		}
		try {
			await promptAsync();
		} catch (err) {
			setAuthResult({
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
