/**
 * @jest-environment jsdom
 */
import 'whatwg-fetch';

import { renderHook } from '@testing-library/react';

import { clearUpdateRequired, currentUpdateRequired } from '@wcpos/utils/update-required-gate';

import { useRestHttpClient } from './index';

const { useHttpClient: useSharedHttpClient } = jest.requireActual<
	typeof import('@wcpos/hooks/use-http-client/use-http-client')
>('@wcpos/hooks/use-http-client/use-http-client');
const { http: sharedHttp } = jest.requireMock('@wcpos/hooks/use-http-client/http') as {
	http: { request: jest.Mock };
};

jest.mock('@wcpos/hooks/use-http-client/http', () => ({
	http: { request: jest.fn(), isCancel: () => false },
}));
jest.mock('@wcpos/hooks/use-http-client/request-queue', () => ({
	scheduleRequest: (request: () => Promise<unknown>) => request(),
}));
jest.mock('@wcpos/hooks/use-http-client/request-state-manager', () => ({
	requestStateManager: {
		checkCanProceed: () => ({ ok: true }),
		isTokenRefreshing: () => false,
	},
}));

const mockRequest = jest.fn(
	async (
		_config: Record<string, unknown>
	): Promise<{ data: unknown; headers?: Record<string, string> }> => ({
		data: null,
	})
);
const mockSetOffline = jest.fn();
const mockUseHttpClient = jest.fn(
	(_handlers: unknown, _onUpdateRequired?: (details: unknown) => void) => ({ request: mockRequest })
);
const mockSite = {
	incrementalPatch: jest.fn(),
	use_jwt_as_param: false,
	use_rest_route_param: false,
	use_protocol_headers: false,
	wcpos_version: '',
	wcpos_api_url: 'https://example.com/wp-json/wcpos/v2',
	wp_api_url: 'https://example.com/wp-json/',
};

jest.mock('@wcpos/hooks/use-http-client', () => ({
	requestStateManager: {
		getRefreshedToken: () => null,
		setOffline: (...args: unknown[]) => mockSetOffline(...args),
	},
	useHttpClient: (handlers: unknown, onUpdateRequired?: (details: unknown) => void) =>
		mockUseHttpClient(handlers, onUpdateRequired),
}));
jest.mock('@wcpos/hooks/use-http-client/create-token-refresh-handler', () => ({
	createTokenRefreshHandler: () => jest.fn(),
}));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'online' }),
}));
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
	getDatabaseEpoch: () => 0,
}));
jest.mock('../../../../contexts/app-state', () => {
	const useAppState = () => ({
		logout: jest.fn(),
		site: mockSite,
		store: { id: 0 },
		wpCredentials: { access_token: 'test-token' },
	});
	return { useAppState, useStoreSession: useAppState };
});
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
jest.mock('./auth-error-handler', () => ({
	useAuthErrorHandler: () => jest.fn(),
}));
jest.mock('./refresh-http-client', () => ({
	createRefreshHttpClient: jest.fn(),
}));

function latestRequest(): Record<string, unknown> {
	const call = mockRequest.mock.calls.at(-1);
	if (!call) throw new Error('HTTP request was not called');
	return call[0];
}

describe('useRestHttpClient methods', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		clearUpdateRequired(mockSite.wp_api_url);
		mockSite.use_jwt_as_param = false;
		mockSite.use_rest_route_param = false;
		mockSite.use_protocol_headers = false;
		mockSite.wcpos_version = '';
		mockSite.wcpos_api_url = 'https://example.com/wp-json/wcpos/v2';
		mockSite.wp_api_url = 'https://example.com/wp-json/';
	});

	it('wires Axios update-required refusals to the current site gate', () => {
		renderHook(() => useRestHttpClient('orders'));

		const onUpdateRequired = mockUseHttpClient.mock.calls.at(-1)?.[1];
		expect(onUpdateRequired).toEqual(expect.any(Function));
		if (!onUpdateRequired) throw new Error('update-required callback was not registered');
		onUpdateRequired({ minProtocol: 2, pluginVersion: '2.0.0', status: 426 });

		expect(currentUpdateRequired(mockSite.wp_api_url)).toEqual({
			minProtocol: 2,
			pluginVersion: '2.0.0',
			status: 426,
		});
	});

	it('keeps the canonical path base and query transport metadata', async () => {
		mockSite.use_rest_route_param = true;
		const { result } = renderHook(() => useRestHttpClient('orders'));

		await result.current.get('/42', { params: { page: 2 } });

		expect(latestRequest()).toMatchObject({
			baseURL: 'https://example.com/wp-json/wcpos/v2/orders',
			wcposPreamble: {
				purpose: 'rest',
				site: { use_rest_route_param: true, wp_api_url: mockSite.wp_api_url },
			},
			url: '/42',
			params: { page: 2 },
		});
	});

	it('passes a trimmed path base and query metadata for a trailing-slash stored base', async () => {
		// Discovery stores wcpos_api_url WITH a trailing slash; rest_route matching
		// is strict, so `/wcpos/v2//orders` would 404 where pretty routing shrugged.
		mockSite.use_rest_route_param = true;
		mockSite.wcpos_api_url = 'https://example.com/wp-json/wcpos/v2/';
		const { result } = renderHook(() => useRestHttpClient('orders'));

		await result.current.get('/42');

		expect(latestRequest()).toMatchObject({
			baseURL: 'https://example.com/wp-json/wcpos/v2/orders',
			wcposPreamble: {
				purpose: 'rest',
				site: { use_rest_route_param: true, wp_api_url: mockSite.wp_api_url },
			},
			url: '/42',
		});
	});

	it('passes a synthetic subdirectory path base and query-shaped site metadata', async () => {
		mockSite.wp_api_url = 'https://example.com/blog/?rest_route=/';
		mockSite.wcpos_api_url = 'https://example.com/blog/?rest_route=/wcpos/v2';
		const { result } = renderHook(() => useRestHttpClient('orders'));

		await result.current.get('/42');

		expect(latestRequest()).toMatchObject({
			baseURL: 'https://example.com/blog/wp-json/wcpos/v2/orders',
			wcposPreamble: {
				purpose: 'rest',
				site: { wp_api_url: mockSite.wp_api_url, use_rest_route_param: false },
			},
			url: '/42',
		});
	});

	it('dispatches a subdirectory REST query URL through the real shared wrapper', async () => {
		mockSite.wp_api_url = 'https://example.com/blog/?rest_route=/';
		mockSite.wcpos_api_url = 'https://example.com/blog/?rest_route=/wcpos/v2';
		sharedHttp.request.mockResolvedValueOnce({ status: 200, data: {} });
		const { result: shared } = renderHook(() => useSharedHttpClient());
		mockRequest.mockImplementationOnce(
			(config) =>
				shared.current.request(config) as unknown as Promise<{
					data: unknown;
					headers?: Record<string, string>;
				}>
		);
		const { result } = renderHook(() => useRestHttpClient('orders'));

		await result.current.get('/42', { params: { page: 2 } });

		const sent = sharedHttp.request.mock.calls.at(-1)?.[0];
		expect(sent.url).toMatch(
			/^https:\/\/example\.com\/blog\/\?rest_route=%2Fwcpos%2Fv2%2Forders%2F42&/
		);
		expect(new URL(sent.url).searchParams.get('page')).toBe('2');
		expect(sent).not.toHaveProperty('wcposPreamble');
	});
	it.each([
		['put', 'PUT'],
		['patch', 'PATCH'],
	] as const)(
		'tunnels %s through POST with only the _method parameter',
		async (clientMethod, method) => {
			const data = { status: 'completed' };
			const { result } = renderHook(() => useRestHttpClient('orders'));

			await result.current[clientMethod]('/42', data);

			const config = latestRequest();
			expect(config).toMatchObject({
				method: 'POST',
				url: '/42',
				data,
				params: { _method: method },
			});
			expect(config.params).not.toHaveProperty('_wcpos_envelope');
			expect(config.headers).not.toHaveProperty('X-HTTP-Method-Override');
		}
	);

	it('tunnels delete through POST with no request body', async () => {
		const { result } = renderHook(() => useRestHttpClient('orders'));

		await result.current.delete('/42');

		const config = latestRequest();
		expect(config).toMatchObject({
			method: 'POST',
			url: '/42',
			params: { _method: 'DELETE' },
		});
		expect(config.params).not.toHaveProperty('_wcpos_envelope');
		expect(config).not.toHaveProperty('data');
		expect(config.headers).not.toHaveProperty('X-HTTP-Method-Override');
	});

	it('keeps get, post, and head on their native methods', async () => {
		const data = { status: 'pending' };
		const { result } = renderHook(() => useRestHttpClient('orders'));

		await result.current.get('/42');
		expect(latestRequest()).toMatchObject({
			method: 'GET',
			url: '/42',
			params: { _wcpos_envelope: 1 },
		});

		await result.current.request({ url: '/42' });
		expect(latestRequest()).toMatchObject({
			url: '/42',
			params: { _wcpos_envelope: 1 },
		});

		await result.current.post('/42', data);
		expect(latestRequest()).toMatchObject({ method: 'POST', url: '/42', data });
		expect(latestRequest().params).not.toHaveProperty('_wcpos_envelope');

		await result.current.head('/42');
		expect(latestRequest()).toMatchObject({ method: 'HEAD', url: '/42' });
		expect(latestRequest().params).not.toHaveProperty('_wcpos_envelope');
	});

	it('unwraps envelope data and restores stripped pagination headers', async () => {
		mockRequest.mockResolvedValueOnce({
			data: { data: [{ id: 1 }], _wcpos: { v: 1, total: 150, total_pages: 2 } },
			headers: {},
		});
		const { result } = renderHook(() => useRestHttpClient('orders'));

		const response = await result.current.get('/');

		expect(response.data).toEqual([{ id: 1 }]);
		expect(response.headers?.['x-wp-total']).toBe('150');
		expect(response.headers?.['x-wp-totalpages']).toBe('2');
	});

	it('preserves a non-empty pagination header while unwrapping data', async () => {
		mockRequest.mockResolvedValueOnce({
			data: { data: [{ id: 1 }], _wcpos: { v: 1, total_pages: 2 } },
			headers: { 'x-wp-totalpages': '3' },
		});
		const { result } = renderHook(() => useRestHttpClient('orders'));

		const response = await result.current.get('/');

		expect(response.data).toEqual([{ id: 1 }]);
		expect(response.headers?.['x-wp-totalpages']).toBe('3');
	});

	it('preserves non-empty mixed-case pagination headers without adding lowercase duplicates', async () => {
		mockRequest.mockResolvedValueOnce({
			data: { data: [{ id: 1 }], _wcpos: { v: 1, total: 150, total_pages: 2 } },
			headers: { 'X-WP-Total': '200', 'X-WP-TotalPages': '3' },
		});
		const { result } = renderHook(() => useRestHttpClient('orders'));

		const response = await result.current.get('/');

		expect(response.headers).toEqual({ 'X-WP-Total': '200', 'X-WP-TotalPages': '3' });
	});

	it('fills empty mixed-case pagination headers using their existing keys', async () => {
		mockRequest.mockResolvedValueOnce({
			data: { data: [{ id: 1 }], _wcpos: { v: 1, total: 150, total_pages: 2 } },
			headers: { 'X-WP-Total': '', 'X-WP-TotalPages': '' },
		});
		const { result } = renderHook(() => useRestHttpClient('orders'));

		const response = await result.current.get('/');

		expect(response.headers).toEqual({ 'X-WP-Total': '150', 'X-WP-TotalPages': '2' });
	});

	it('passes through a non-envelope body without inventing headers', async () => {
		const data = [{ id: 1 }];
		mockRequest.mockResolvedValueOnce({ data });
		const { result } = renderHook(() => useRestHttpClient('orders'));

		const response = await result.current.get('/');

		expect(response.data).toBe(data);
		expect(response.headers).toBeUndefined();
	});

	it.each([-2, '2'])(
		'ignores invalid total_pages metadata %p while unwrapping data',
		async (totalPages) => {
			mockRequest.mockResolvedValueOnce({
				data: { data: [{ id: 1 }], _wcpos: { v: 1, total_pages: totalPages } },
				headers: {},
			});
			const { result } = renderHook(() => useRestHttpClient('orders'));

			const response = await result.current.get('/');

			expect(response.data).toEqual([{ id: 1 }]);
			expect(response.headers).not.toHaveProperty('x-wp-totalpages');
		}
	);
});
