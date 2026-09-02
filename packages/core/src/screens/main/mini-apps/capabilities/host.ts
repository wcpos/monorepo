import * as React from 'react';

import { Toast } from '@wcpos/components/toast';
import { openExternalURL } from '@wcpos/utils/open-external-url';

import { BridgeError, type BridgeHandlers } from '../bridge/types';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';

const ALLOWED_REST_PREFIXES = ['/wcpos/v1/', '/wc/v3/', '/wp/v2/'];
const MAX_RESPONSE_LENGTH = 1024 * 1024;
// The host owns authentication; a page may never set or override these.
const BLOCKED_REQUEST_HEADERS = ['authorization', 'cookie', 'x-wcpos', 'host'];

function isHttpResponseError(
	error: unknown
): error is { response: { status: number; headers?: Record<string, unknown>; data: unknown } } {
	return (
		!!error &&
		typeof error === 'object' &&
		typeof (error as { response?: { status?: unknown } }).response?.status === 'number'
	);
}

export function useHostCapabilities(onClose: (result: string) => void): BridgeHandlers {
	const http = useRestHttpClient();

	return React.useMemo(
		() => ({
			'http.proxy': async (payload) => {
				const { method, path, query, body, headers } = payload;
				if (typeof path !== 'string' || !ALLOWED_REST_PREFIXES.some((p) => path.startsWith(p))) {
					throw new BridgeError('bad_request', 'Path is not an allowed store REST endpoint');
				}
				const search = new URLSearchParams();
				if (query && typeof query === 'object' && !Array.isArray(query)) {
					for (const [key, value] of Object.entries(query)) search.set(key, String(value));
				}
				const requestHeaders = Object.fromEntries(
					Object.entries(headers && typeof headers === 'object' ? headers : {}).filter(
						([key, value]) =>
							typeof value === 'string' && !BLOCKED_REQUEST_HEADERS.includes(key.toLowerCase())
					)
				);
				let response: { status: number; headers?: Record<string, unknown>; data: unknown };
				try {
					response = (await http.request({
						method: typeof method === 'string' ? method.toUpperCase() : 'GET',
						url: `${path}${search.toString() ? `?${search}` : ''}`,
						data: body,
						headers: requestHeaders,
					})) as typeof response;
				} catch (error) {
					// A 4xx/5xx from the store is a response the page must see, not a bridge failure.
					if (!isHttpResponseError(error)) throw error;
					response = error.response;
				}
				const contentType = String(response.headers?.['content-type'] ?? '');
				const serialized = JSON.stringify(response.data);
				const result = {
					status: response.status,
					headers: { 'content-type': contentType },
					body: response.data,
				};
				return serialized.length > MAX_RESPONSE_LENGTH
					? { ...result, body: serialized.slice(0, MAX_RESPONSE_LENGTH), truncated: true }
					: result;
			},
			'ui.toast': async ({ message, kind }) => {
				if (typeof message !== 'string')
					throw new BridgeError('bad_request', 'Toast message required');
				Toast.show({ title: message, type: kind as 'info' | 'success' | 'error' });
				return {};
			},
			'ui.close': async ({ result }) => {
				setTimeout(() => onClose(typeof result === 'string' ? result : 'unchanged'), 0);
				return {};
			},
			'ui.openExternal': async ({ url }) => {
				let isHttps = false;
				try {
					isHttps = typeof url === 'string' && new URL(url).protocol === 'https:';
				} catch {
					isHttps = false;
				}
				if (!isHttps) {
					throw new BridgeError('bad_request', 'Only https external URLs are allowed');
				}
				await openExternalURL(url as string);
				return {};
			},
		}),
		[http, onClose]
	);
}
