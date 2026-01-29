/**
 * Electron implementation of useWcposAuth
 * Uses IPC to open a modal BrowserWindow in the main process
 */
import * as React from 'react';

import AppInfo from '@wcpos/utils/app-info';
import { getLogger } from '@wcpos/utils/logger';

import { buildAuthUrl, generateState, getRedirectUri } from './utils';

import type { UseWcposAuthReturn, WcposAuthConfig, WcposAuthResult } from './types';

const oauthLogger = getLogger(['wcpos', 'auth', 'oauth']);

export type { WcposAuthConfig, WcposAuthResult, UseWcposAuthReturn } from './types';

declare global {
	interface Window {
		ipcRenderer: {
			invoke: (channel: string, args: unknown) => Promise<unknown>;
		};
	}
}

interface IpcAuthResult {
	type: 'success' | 'error' | 'dismiss' | 'cancel';
	params?: Record<string, string>;
	error?: string;
}

export function useWcposAuth(config: WcposAuthConfig): UseWcposAuthReturn {
	const [response, setResponse] = React.useState<WcposAuthResult | null>(null);

	const redirectUri = React.useMemo(() => getRedirectUri(), []);

	const isReady = !!config.site;

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

	const promptAsync = React.useCallback(async (): Promise<WcposAuthResult | void> => {
		if (!config.site) {
			oauthLogger.warn('Auth not ready - no site configured');
			return;
		}

		// Generate a fresh state for each auth request (CSRF protection)
		const state = generateState();

		// Build auth URL with state parameter including platform/version info
		const authUrl = buildAuthUrl(
			config.site.wcpos_login_url,
			redirectUri,
			state,
			mergedExtraParams
		);

		oauthLogger.debug('Triggering Electron auth flow via IPC', {
			context: { authUrl, redirectUri, state: state.substring(0, 8) + '...' },
		});

		try {
			const result = (await window.ipcRenderer.invoke('auth:prompt', {
				authUrl,
				redirectUri,
				state, // Pass state to main process for validation
			})) as IpcAuthResult;

			oauthLogger.debug('Auth IPC result received', {
				context: { type: result.type },
			});

			// Validate state parameter on success
			if (result.type === 'success' && result.params) {
				const returnedState = result.params.state;
				if (returnedState !== state) {
					oauthLogger.error('State parameter mismatch - possible CSRF attack', {
						context: {
							expected: state.substring(0, 8) + '...',
							received: returnedState?.substring(0, 8) + '...',
						},
					});

					const errorResult: WcposAuthResult = {
						type: 'error',
						error: 'State parameter mismatch - authentication rejected for security',
					};
					setResponse(errorResult);
					return errorResult;
				}
			}

			// Convert IPC result to our unified format
			const authResult: WcposAuthResult = {
				type: result.type,
				params: result.params as any,
				error: result.error,
			};

			setResponse(authResult);
			return authResult;
		} catch (err) {
			oauthLogger.error('Auth IPC failed', {
				context: { error: err instanceof Error ? err.message : String(err) },
			});

			const errorResult: WcposAuthResult = {
				type: 'error',
				error: err instanceof Error ? err.message : 'Authentication failed',
			};

			setResponse(errorResult);
			return errorResult;
		}
	}, [config.site, mergedExtraParams, redirectUri]);

	return {
		isReady,
		response,
		promptAsync,
	};
}
