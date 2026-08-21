/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

import { useRestHttpClient } from './index';

const mockRequest = jest.fn(
	async (
		_config: Record<string, unknown>
	): Promise<{ data: unknown; headers?: Record<string, string> }> => ({
		data: null,
	})
);
const mockSetOffline = jest.fn();

jest.mock('@wcpos/hooks/use-http-client', () => ({
	requestStateManager: {
		getRefreshedToken: () => null,
		setOffline: (...args: unknown[]) => mockSetOffline(...args),
	},
	useHttpClient: () => ({ request: mockRequest }),
}));
jest.mock('@wcpos/hooks/use-http-client/create-token-refresh-handler', () => ({
	createTokenRefreshHandler: () => jest.fn(),
}));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'online' }),
}));
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ debug: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}));
jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({
		logout: jest.fn(),
		site: {
			incrementalPatch: jest.fn(),
			use_jwt_as_param: false,
			wcpos_api_url: 'https://example.com/wp-json/wcpos/v2',
			wp_api_url: 'https://example.com/wp-json/',
		},
		store: { id: 0 },
		wpCredentials: { access_token: 'test-token' },
	}),
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
jest.mock('./auth-error-handler', () => ({
	errorSubject: { asObservable: () => ({}) },
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
