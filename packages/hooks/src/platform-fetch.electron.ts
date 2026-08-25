/**
 * `fetch`, but over the main process — the Electron variant.
 *
 * The renderer runs on the custom scheme `wcpos://-`, so every request to a
 * store is cross-origin and the renderer's own `fetch` is subject to whatever
 * CORS response that store's host sends. Hosts that rewrite
 * `Access-Control-Allow-Origin` to echo the caller's Origin return an EMPTY
 * value for a custom scheme, and the request fails before it is ever made.
 *
 * Routing through the `http-request` IPC seam sidesteps CORS entirely: the
 * request is made by the main process with Chromium's net.fetch. That is the
 * reason the seam exists.
 *
 * This shipped as a bug in 1.10.2: the connect-time authorization probes used
 * the renderer's fetch, so the app reported "The store's REST API did not answer
 * at any address" for stores that answered 200 over this bridge.
 *
 * DUPLICATION, deliberate and tracked: apps/main/lib/engine-platform-fetch.electron.ts
 * is the same adapter for the sync engine. Collapsing them is the obvious next
 * step and was attempted here, but its test suite mocks the bridge by package
 * specifier and this module imports it relatively, so the move needs its own
 * pass — not one riding along on a hotfix for a bricked app. See monorepo#1583.
 *
 * `validateStatus: null` is load-bearing — probes read non-2xx responses as
 * evidence, so a 401/403/404 must come back as a Response, not a throw.
 */
import { http } from './use-http-client';

type BridgeResponse = {
	data: unknown;
	status: number;
	statusText?: string;
	headers: Record<string, string>;
};

const toResponse = (response: BridgeResponse): Response => {
	const body = [204, 205, 304].includes(response.status)
		? null
		: typeof response.data === 'string'
			? response.data
			: JSON.stringify(response.data);

	return new Response(body, {
		status: response.status,
		statusText: response.statusText ?? '',
		headers: new Headers(response.headers),
	});
};

export const platformFetch: typeof globalThis.fetch = async (url, init) => {
	const requestUrl = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
	if (init?.body != null && typeof init.body !== 'string') {
		throw new TypeError('engine fetch: unsupported body type');
	}

	const config = {
		url: requestUrl,
		method: init?.method ?? 'GET',
		headers: Object.fromEntries(new Headers(init?.headers).entries()),
		signal: init?.signal ?? undefined,
		validateStatus: null,
		responseType: 'text' as const,
		...(typeof init?.body === 'string' ? { data: init.body } : {}),
	};

	try {
		return toResponse((await http.request(config)) as BridgeResponse);
	} catch (error) {
		const errorShape = error as { name?: unknown; code?: unknown } | null;
		if (
			http.isCancel(error) ||
			errorShape?.name === 'CanceledError' ||
			errorShape?.code === 'ERR_CANCELED'
		) {
			throw new DOMException('Aborted', 'AbortError');
		}

		const response = (error as { response?: BridgeResponse } | null)?.response;
		if (response) {
			try {
				return toResponse(response);
			} catch {
				// Fall through to the network error mapping below.
			}
		}

		throw new TypeError('Network request failed', { cause: error });
	}
};
