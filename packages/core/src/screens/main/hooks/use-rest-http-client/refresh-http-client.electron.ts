/**
 * Token Refresh HTTP Client - Electron
 *
 * In Electron, the renderer process is sandboxed and direct fetch() calls
 * may fail with "Failed to fetch" due to network restrictions.
 *
 * All HTTP requests in Electron must go through IPC to the main process.
 * This module provides a token refresh client that uses the same IPC
 * mechanism as the main HTTP client.
 *
 * @see refresh-http-client.ts - Default implementation for web/native
 * @see packages/hooks/src/use-http-client/http.electron.ts - Main IPC HTTP
 */

import type { AxiosRequestConfig } from 'axios';

declare global {
	interface Window {
		ipcRenderer: {
			invoke: (channel: string, args: unknown) => Promise<unknown>;
		};
	}
}

interface RefreshHttpClient {
	post: (
		url: string,
		data: unknown,
		config?: AxiosRequestConfig
	) => Promise<{
		data: unknown;
		status: number;
		statusText: string;
	}>;
}

/**
 * Create an HTTP client for token refresh requests via Electron IPC.
 *
 * This bypasses the normal error handling chain while still routing
 * requests through the main process (which has proper network access).
 */
export function createRefreshHttpClient(): RefreshHttpClient {
	return {
		post: async (url: string, data: unknown, config: AxiosRequestConfig = {}) => {
			const requestId = crypto.randomUUID();

			// Construct axios-compatible config for IPC
			const axiosConfig = {
				method: 'POST',
				url,
				data,
				headers: {
					'Content-Type': 'application/json',
					...config.headers,
				},
			};

			// Send request through IPC to main process
			const result = (await window.ipcRenderer.invoke('axios', {
				type: 'request',
				requestId,
				config: axiosConfig,
			})) as {
				success?: boolean;
				data?: unknown;
				status?: number;
				statusText?: string;
				message?: string;
				response?: { data?: Record<string, unknown>; status?: number };
			};

			// Handle IPC error response
			if (result.success === false) {
				// Include response details in error message for better debugging
				const respData = result.response?.data as Record<string, unknown> | undefined;
				const errorMessage =
					(respData?.error_description as string) ||
					(respData?.message as string) ||
					result.message ||
					`HTTP ${result.response?.status || 'unknown'}`;

				const error = new Error(errorMessage);
				(error as any).status = result.response?.status;
				(error as any).response = result.response;
				throw error;
			}

			// Success response
			return {
				data: result.data,
				status: result.status ?? 200,
				statusText: result.statusText ?? 'OK',
			};
		},
	};
}
