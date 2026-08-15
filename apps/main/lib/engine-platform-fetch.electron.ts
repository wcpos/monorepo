import { http } from '@wcpos/hooks/use-http-client';

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

export const platformEngineFetch: typeof globalThis.fetch = async (url, init) => {
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
