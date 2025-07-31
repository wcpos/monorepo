import * as React from 'react';

import useHttpClient from '@wcpos/hooks/use-http-client';
import log from '@wcpos/utils/logger';

import { useT } from '../../../contexts/translations';

export type AuthTestingStatus = 'idle' | 'testing' | 'success' | 'error';

interface AuthTestResult {
	supportsHeaderAuth: boolean;
	supportsParamAuth: boolean;
	useJwtAsParam: boolean;
}

interface UseAuthTestingReturn {
	status: AuthTestingStatus;
	error: string | null;
	testResult: AuthTestResult | null;
	testAuthorizationMethod: (
		wcposApiUrl: string,
		accessToken?: string
	) => Promise<AuthTestResult | null>;
}

/**
 * Hook for testing whether the server supports Authorization headers or requires query parameters
 * This is important because some servers block Authorization headers for security reasons
 */
export const useAuthTesting = (): UseAuthTestingReturn => {
	const [status, setStatus] = React.useState<AuthTestingStatus>('idle');
	const [error, setError] = React.useState<string | null>(null);
	const [testResult, setTestResult] = React.useState<AuthTestResult | null>(null);
	const http = useHttpClient();
	const t = useT();

	/**
	 * Test authorization with Bearer token in header
	 */
	const testHeaderAuth = React.useCallback(
		async (wcposApiUrl: string, token: string): Promise<boolean> => {
			try {
				log.debug('Testing header-based authorization');

				const response = await http.get(`${wcposApiUrl}auth/test`, {
					headers: {
						'X-WCPOS': '1',
						Authorization: `Bearer ${token}`,
					},
					timeout: 10000, // 10 second timeout
				});

				const data = response?.data;
				const isSuccess = data && data.status === 'success';

				log.debug('Header auth test result:', { success: isSuccess, data });
				return isSuccess;
			} catch (err) {
				log.debug('Header auth test failed:', err.message);
				return false;
			}
		},
		[http]
	);

	/**
	 * Test authorization with token as query parameter
	 */
	const testParamAuth = React.useCallback(
		async (wcposApiUrl: string, token: string): Promise<boolean> => {
			try {
				log.debug('Testing parameter-based authorization');

				const response = await http.get(`${wcposApiUrl}auth/test`, {
					params: {
						authorization: `Bearer ${token}`,
					},
					headers: {
						'X-WCPOS': '1',
					},
					timeout: 10000, // 10 second timeout
				});

				const data = response?.data;
				const isSuccess = data && data.status === 'success';

				log.debug('Parameter auth test result:', { success: isSuccess, data });
				return isSuccess;
			} catch (err) {
				log.debug('Parameter auth test failed:', err.message);
				return false;
			}
		},
		[http]
	);

	/**
	 * Generate a mock JWT token for testing
	 * This is a simple mock token that should work with the WCPOS test endpoint
	 */
	const generateMockToken = React.useCallback((): string => {
		// Generate a simple mock token for testing
		// The actual token format doesn't matter for the test endpoint
		const payload = {
			test: true,
			timestamp: Date.now(),
		};

		// Simple base64 encoding for testing purposes
		const encodedPayload = btoa(JSON.stringify(payload));
		return `mock.${encodedPayload}.test`;
	}, []);

	/**
	 * Main testing function
	 */
	const testAuthorizationMethod = React.useCallback(
		async (wcposApiUrl: string, accessToken?: string): Promise<AuthTestResult | null> => {
			if (!wcposApiUrl || wcposApiUrl.trim() === '') {
				setError(t('WCPOS API URL is required', { _tags: 'core' }));
				return null;
			}

			setStatus('testing');
			setError(null);
			setTestResult(null);

			try {
				log.debug('Starting authorization method testing for:', wcposApiUrl);

				// Use provided token or generate a mock one for testing
				const testToken = accessToken || generateMockToken();

				// Test both methods
				const [headerSupported, paramSupported] = await Promise.all([
					testHeaderAuth(wcposApiUrl, testToken),
					testParamAuth(wcposApiUrl, testToken),
				]);

				// Determine the best method to use
				let useJwtAsParam = false;

				if (headerSupported && paramSupported) {
					// Both work, prefer headers for security
					useJwtAsParam = false;
					log.debug('Both authorization methods supported, using headers');
				} else if (headerSupported && !paramSupported) {
					// Only headers work
					useJwtAsParam = false;
					log.debug('Only header authorization supported');
				} else if (!headerSupported && paramSupported) {
					// Only params work
					useJwtAsParam = true;
					log.debug('Only parameter authorization supported');
				} else {
					// Neither work - this is an error condition
					throw new Error(t('Server does not support any authorization method', { _tags: 'core' }));
				}

				const result: AuthTestResult = {
					supportsHeaderAuth: headerSupported,
					supportsParamAuth: paramSupported,
					useJwtAsParam,
				};

				setTestResult(result);
				setStatus('success');

				log.debug('Authorization testing completed:', result);
				return result;
			} catch (err) {
				const errorMessage =
					err.message || t('Failed to test authorization methods', { _tags: 'core' });
				setError(errorMessage);
				setStatus('error');
				log.error('Authorization testing failed:', errorMessage);
				return null;
			}
		},
		[testHeaderAuth, testParamAuth, generateMockToken, t]
	);

	return {
		status,
		error,
		testResult,
		testAuthorizationMethod,
	};
};
