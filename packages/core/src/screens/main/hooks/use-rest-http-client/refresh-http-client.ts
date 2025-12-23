/**
 * Token Refresh HTTP Client - Default (Web/Native)
 *
 * This provides a simple HTTP client for token refresh requests that
 * bypasses the normal error handling chain (to avoid circular refresh attempts).
 *
 * For web and React Native, we use the standard fetch() API.
 * Electron has a separate implementation that uses IPC.
 *
 * @see refresh-http-client.electron.ts - Electron-specific implementation
 */

interface RefreshHttpClient {
	post: (
		url: string,
		data: any,
		config?: { headers?: Record<string, string> }
	) => Promise<{
		data: any;
		status: number;
		statusText: string;
	}>;
}

/**
 * Create an HTTP client for token refresh requests.
 *
 * This uses fetch() directly to avoid:
 * 1. Circular error handling (token refresh triggering token refresh)
 * 2. Request queuing delays
 *
 * The tradeoff is that this doesn't have the same error reconstruction
 * as the main HTTP client, but for token refresh we only need basic
 * success/failure detection.
 */
export function createRefreshHttpClient(): RefreshHttpClient {
	return {
		post: async (url: string, data: any, config: { headers?: Record<string, string> } = {}) => {
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...config.headers,
				},
				body: JSON.stringify(data),
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			return {
				data: await response.json(),
				status: response.status,
				statusText: response.statusText,
			};
		},
	};
}
