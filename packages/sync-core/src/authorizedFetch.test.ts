import { describe, expect, it, vi } from 'vitest';

import { AuthForbiddenError, AuthRefreshExhaustedError } from './authSession';
import { createAuthTokenStore } from './authToken';
import { type AuthorizedFetchInit, createAuthorizedFetcher } from './authorizedFetch';

/** Read the (always-normalized-to-a-record) headers the fetcher forwarded. */
function headerRecord(init: AuthorizedFetchInit): Record<string, string> {
	return (init.headers ?? {}) as Record<string, string>;
}

/** A transport that 401s until the request carries `Bearer <expectedToken>`, then 200s. */
function tokenGatedTransport(expectedToken: string, ok: { status: number } = { status: 200 }) {
	return vi.fn(async (url: string, init: AuthorizedFetchInit) => {
		const carriesHeader = headerRecord(init).Authorization === `Bearer ${expectedToken}`;
		const carriesParam = url.includes(
			`authorization=${encodeURIComponent(`Bearer ${expectedToken}`)}`
		);
		return carriesHeader || carriesParam ? { ...ok } : { status: 401 };
	});
}

describe('createAuthorizedFetcher', () => {
	it('attaches the current token and returns the response when authorized', async () => {
		const tokenStore = createAuthTokenStore('tok');
		const refreshToken = vi.fn(async () => {});
		const transport = tokenGatedTransport('tok', { status: 200 });
		const fetcher = createAuthorizedFetcher({
			transport,
			tokenStore,
			authTransport: 'header',
			refreshToken,
		});

		const response = await fetcher('https://shop.example/api');

		expect(response.status).toBe(200);
		expect(transport).toHaveBeenCalledTimes(1);
		expect(headerRecord(transport.mock.calls[0][1]).Authorization).toBe('Bearer tok');
		expect(refreshToken).not.toHaveBeenCalled();
	});

	it('refreshes on a 401, retries with the refreshed token, and returns the response', async () => {
		const tokenStore = createAuthTokenStore('stale');
		const refreshToken = vi.fn(async () => {
			tokenStore.set('fresh');
		});
		const transport = tokenGatedTransport('fresh');
		const fetcher = createAuthorizedFetcher({
			transport,
			tokenStore,
			authTransport: 'header',
			refreshToken,
		});

		const response = await fetcher('https://shop.example/api');

		expect(response.status).toBe(200);
		expect(refreshToken).toHaveBeenCalledTimes(1);
		expect(transport).toHaveBeenCalledTimes(2);
		expect(headerRecord(transport.mock.calls[1][1]).Authorization).toBe('Bearer fresh');
	});

	it('bootstraps from an empty token store via the refresh path', async () => {
		const tokenStore = createAuthTokenStore(null);
		const refreshToken = vi.fn(async () => {
			tokenStore.set('minted');
		});
		const transport = tokenGatedTransport('minted');
		const fetcher = createAuthorizedFetcher({
			transport,
			tokenStore,
			authTransport: 'header',
			refreshToken,
		});

		const response = await fetcher('https://shop.example/api');

		expect(response.status).toBe(200);
		expect(headerRecord(transport.mock.calls[0][1]).Authorization).toBeUndefined();
		expect(refreshToken).toHaveBeenCalledTimes(1);
	});

	it('forwards method, body, and other init fields verbatim (composes with the write path)', async () => {
		const tokenStore = createAuthTokenStore('tok');
		const refreshToken = vi.fn(async () => {});
		const transport = tokenGatedTransport('tok');
		const fetcher = createAuthorizedFetcher({
			transport,
			tokenStore,
			authTransport: 'header',
			refreshToken,
		});

		await fetcher('https://shop.example/push/orders', {
			method: 'POST',
			body: JSON.stringify({ mutationId: 'm1' }),
			headers: { 'Content-Type': 'application/json' },
		});

		const init = transport.mock.calls[0][1];
		expect(init.method).toBe('POST');
		expect(init.body).toBe(JSON.stringify({ mutationId: 'm1' }));
		// the auth header is added ALONGSIDE the caller's headers
		expect(headerRecord(init)).toEqual({
			'Content-Type': 'application/json',
			Authorization: 'Bearer tok',
		});
	});

	it('normalizes a Headers instance so pre-set headers survive (not silently dropped)', async () => {
		const tokenStore = createAuthTokenStore('tok');
		const refreshToken = vi.fn(async () => {});
		const transport = tokenGatedTransport('tok');
		const fetcher = createAuthorizedFetcher({
			transport,
			tokenStore,
			authTransport: 'header',
			refreshToken,
		});

		await fetcher('https://shop.example/api', { headers: new Headers({ 'X-Trace': 'abc' }) });

		// spreading a Headers instance would have lost X-Trace; normalization keeps it.
		expect(headerRecord(transport.mock.calls[0][1])).toEqual({
			'x-trace': 'abc',
			Authorization: 'Bearer tok',
		});
	});

	it('normalizes a header tuple array too', async () => {
		const tokenStore = createAuthTokenStore('tok');
		const refreshToken = vi.fn(async () => {});
		const transport = tokenGatedTransport('tok');
		const fetcher = createAuthorizedFetcher({
			transport,
			tokenStore,
			authTransport: 'header',
			refreshToken,
		});

		await fetcher('https://shop.example/api', { headers: [['Accept', 'application/json']] });

		expect(headerRecord(transport.mock.calls[0][1])).toEqual({
			Accept: 'application/json',
			Authorization: 'Bearer tok',
		});
	});

	it('surfaces a 403 as AuthForbiddenError without refreshing', async () => {
		const tokenStore = createAuthTokenStore('tok');
		const refreshToken = vi.fn(async () => {});
		const transport = vi.fn(async () => ({ status: 403 }));
		const fetcher = createAuthorizedFetcher({
			transport,
			tokenStore,
			authTransport: 'header',
			refreshToken,
		});

		await expect(fetcher('https://shop.example/api')).rejects.toBeInstanceOf(AuthForbiddenError);
		expect(refreshToken).not.toHaveBeenCalled();
	});

	it('surfaces AuthRefreshExhaustedError when a 401 persists after refresh', async () => {
		const tokenStore = createAuthTokenStore('tok');
		const refreshToken = vi.fn(async () => {});
		const transport = vi.fn(async () => ({ status: 401 }));
		const fetcher = createAuthorizedFetcher({
			transport,
			tokenStore,
			authTransport: 'header',
			refreshToken,
			maxRefreshAttempts: 1,
		});

		await expect(fetcher('https://shop.example/api')).rejects.toBeInstanceOf(
			AuthRefreshExhaustedError
		);
		expect(refreshToken).toHaveBeenCalledTimes(1);
	});

	it('carries the token as a query param under query transport', async () => {
		const tokenStore = createAuthTokenStore('tok');
		const refreshToken = vi.fn(async () => {});
		const transport = tokenGatedTransport('tok');
		const fetcher = createAuthorizedFetcher({
			transport,
			tokenStore,
			authTransport: 'query',
			refreshToken,
		});

		const response = await fetcher('https://shop.example/api?limit=50');

		expect(response.status).toBe(200);
		expect(transport.mock.calls[0][0]).toBe(
			'https://shop.example/api?limit=50&authorization=Bearer%20tok'
		);
		expect(headerRecord(transport.mock.calls[0][1]).Authorization).toBeUndefined();
	});

	it('passes the caller signal and base headers through to the transport', async () => {
		const tokenStore = createAuthTokenStore('tok');
		const refreshToken = vi.fn(async () => {});
		const transport = tokenGatedTransport('tok');
		const fetcher = createAuthorizedFetcher({
			transport,
			tokenStore,
			authTransport: 'header',
			refreshToken,
		});
		const signal = new AbortController().signal;

		await fetcher('https://shop.example/api', { headers: { Accept: 'application/json' }, signal });

		expect(transport.mock.calls[0][1].signal).toBe(signal);
		expect(headerRecord(transport.mock.calls[0][1]).Accept).toBe('application/json');
	});

	it('does not refresh a request aborted after a 401 (scope-switch / offline race)', async () => {
		// The transport resolves 401 but the caller has since aborted (e.g. a store
		// swap). A refresh here would mutate the SHARED token store for abandoned work.
		const tokenStore = createAuthTokenStore('tok');
		const refreshToken = vi.fn(async () => {
			tokenStore.set('fresh');
		});
		const controller = new AbortController();
		const transport = vi.fn(async () => {
			controller.abort(); // aborted while the response is in flight
			return { status: 401 };
		});
		const fetcher = createAuthorizedFetcher({
			transport,
			tokenStore,
			authTransport: 'header',
			refreshToken,
		});

		await expect(
			fetcher('https://shop.example/api', { signal: controller.signal })
		).rejects.toMatchObject({ name: 'AbortError' });
		expect(refreshToken).not.toHaveBeenCalled();
		expect(transport).toHaveBeenCalledTimes(1);
	});

	it('bails before touching the transport when handed an already-aborted signal', async () => {
		const tokenStore = createAuthTokenStore('tok');
		const refreshToken = vi.fn(async () => {});
		const transport = vi.fn(async () => ({ status: 200 }));
		const fetcher = createAuthorizedFetcher({
			transport,
			tokenStore,
			authTransport: 'header',
			refreshToken,
		});

		await expect(
			fetcher('https://shop.example/api', { signal: AbortSignal.abort() })
		).rejects.toMatchObject({ name: 'AbortError' });
		expect(transport).not.toHaveBeenCalled();
		expect(refreshToken).not.toHaveBeenCalled();
	});

	it('coalesces a concurrent 401 stampede into ONE refresh (inherited from the session)', async () => {
		const tokenStore = createAuthTokenStore('stale');
		const refreshToken = vi.fn(async () => {
			tokenStore.set('fresh');
		});
		const transport = tokenGatedTransport('fresh');
		const fetcher = createAuthorizedFetcher({
			transport,
			tokenStore,
			authTransport: 'header',
			refreshToken,
		});

		const responses = await Promise.all([
			fetcher('https://shop.example/a'),
			fetcher('https://shop.example/b'),
			fetcher('https://shop.example/c'),
		]);

		expect(responses.every((r) => r.status === 200)).toBe(true);
		expect(refreshToken).toHaveBeenCalledTimes(1);
	});
});
