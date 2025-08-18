import * as React from 'react';

import { CanceledError } from 'axios';
import { makeRedirectUri, ResponseType, useAuthRequest } from 'expo-auth-session';
import { BehaviorSubject } from 'rxjs';

import log from '@wcpos/utils/logger';
import type { HttpErrorHandler } from '@wcpos/hooks/use-http-client';

import type { LoginResponse, Site, TokenRefreshResponse, WPCredentials } from './types';

const errorSubject = new BehaviorSubject(null);

/**
 * Custom hook for handling login flow
 */
const useLoginHandler = (site: Site) => {
	const [isProcessing, setIsProcessing] = React.useState(false);
	const [error, setError] = React.useState<Error | null>(null);

	const handleLoginSuccess = React.useCallback((response: any) => {
		setIsProcessing(true);
		setError(null);

		try {
			// TODO: Handle the successful login response
			// This should update the wpCredentials with new tokens
			log.debug('Login success, updating tokens', { context: { response } });

			// You'll need to implement this based on your app state management
			// site.updateTokens(response.params);
		} catch (err) {
			setError(err instanceof Error ? err : new Error('Login failed'));
			log.error('Failed to handle login success', {
				context: { error: err },
				showToast: true,
			});
		} finally {
			setIsProcessing(false);
		}
	}, []);

	return { handleLoginSuccess, isProcessing, error };
};

/**
 * Hook that creates an auth error handler for token refresh and login redirect
 */
export const useAuthErrorHandler = (site: Site, wpCredentials: WPCredentials): HttpErrorHandler => {
	const { handleLoginSuccess, isProcessing } = useLoginHandler(site);

	const redirectUri = makeRedirectUri({
		scheme: 'wcpos',
		path: (window as any)?.baseUrl ?? undefined,
	});

	// Point at this site's auth endpoint
	const discovery = {
		authorizationEndpoint: site.wcpos_login_url,
	};

	const [request, response, promptAsync] = useAuthRequest(
		{
			clientId: 'unused', // expo requires this field
			responseType: ResponseType.Token,
			redirectUri,
			extraParams: { redirect_uri: redirectUri },
			scopes: [],
			usePKCE: false,
		},
		discovery
	);

	// Handle auth response
	React.useEffect(() => {
		if (response?.type === 'success') {
			log.debug(`Login successful for site: ${site.name}`);
			handleLoginSuccess(response as any);
		} else if (response?.type === 'error') {
			log.error(`Login failed: ${response.error}`, {
				showToast: true,
				context: {
					siteName: site.name,
					response,
				},
			});
		}
	}, [response, handleLoginSuccess, site.name]);

	// Token refresh is now handled by the dedicated createTokenRefreshHandler
	// This handler only deals with cases where token refresh has already failed

	return React.useMemo(
		() => ({
			name: 'fallback-auth-handler',
			priority: 50, // Lower priority - runs after token refresh handler
			canHandle: (error) => error.response?.status === 401,
			handle: async (context) => {
				// Token refresh has already failed if we reach this handler
				log.debug('Token refresh failed, attempting OAuth flow');
				errorSubject.next(context.error);

				// Try the OAuth flow as last resort
				try {
					await promptAsync();
					// If promptAsync succeeds, the useEffect will handle the response
					// For now, we'll throw a CanceledError to stop the request chain
					throw new CanceledError('401 - attempting re-authentication');
				} catch (authError) {
					// If auth flow fails, throw the error to let the app handle it
					log.error('Authentication flow failed', {
						context: { error: authError instanceof Error ? authError.message : String(authError) },
						showToast: true,
					});
					throw new CanceledError('401 - authentication failed');
				}
			},
			intercepts: true, // This handler intercepts and stops the error chain
		}),
		[promptAsync]
	);
};

// Export the error subject for other components to subscribe to
export { errorSubject };
