import * as React from 'react';

import { Toast } from '@wcpos/components/toast';
import { openExternalURL } from '@wcpos/utils/open-external-url';

import { BridgeError, type BridgeHandlers } from '../bridge/types';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';

const ALLOWED_REST_PREFIXES = ['/wcpos/v1/', '/wc/v3/', '/wp/v2/'];
const MAX_RESPONSE_LENGTH = 1024 * 1024;

export function useHostCapabilities(onClose: (result: string) => void): BridgeHandlers {
	const http = useRestHttpClient();

	return React.useMemo(
		() => ({
			'http.proxy': async (payload) => {
				const { method, path, query, body } = payload;
				if (typeof path !== 'string' || !ALLOWED_REST_PREFIXES.some((p) => path.startsWith(p))) {
					throw new BridgeError('bad_request', 'Path is not an allowed store REST endpoint');
				}
				const search = new URLSearchParams();
				if (query && typeof query === 'object' && !Array.isArray(query)) {
					for (const [key, value] of Object.entries(query)) search.set(key, String(value));
				}
				const response = (await http.request({
					method: typeof method === 'string' ? method.toUpperCase() : 'GET',
					url: `${path}${search.toString() ? `?${search}` : ''}`,
					data: body,
				})) as { status: number; headers?: Record<string, unknown>; data: unknown };
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
