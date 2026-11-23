/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';

import { useHostCapabilities } from './host';
import { MINI_APP_PROXY_SCOPES, type MiniAppProxyScope } from '../catalog';

const WIDE: MiniAppProxyScope = {
	methods: ['GET', 'POST', 'PUT', 'DELETE'],
	paths: ['/wcpos/v1/', '/wc/v3/', '/wp/v2/'],
};

const mockRequest = jest.fn(async (_config: unknown) => ({
	status: 200,
	headers: { 'content-type': 'application/json' },
	data: { ok: true },
}));
const mockOpenExternalURL = jest.fn(async (_url: string) => undefined);

jest.mock('../../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({ request: (config: unknown) => mockRequest(config) }),
}));
jest.mock('@wcpos/utils/open-external-url', () => ({
	openExternalURL: (url: string) => mockOpenExternalURL(url),
}));
jest.mock('@wcpos/components/toast', () => ({ Toast: { show: jest.fn() } }));

describe('useHostCapabilities', () => {
	beforeEach(() => jest.clearAllMocks());

	it('allows only the three merchant REST path prefixes', async () => {
		const { result } = renderHook(() => useHostCapabilities(jest.fn(), WIDE));

		for (const path of ['/wcpos/v1/settings', '/wc/v3/orders', '/wp/v2/users']) {
			await act(async () => {
				await result.current['http.proxy']({
					method: 'GET',
					path,
					headers: { 'x-Wcpos-Instance': 'forged' },
				});
			});
		}
		expect(mockRequest).toHaveBeenCalledTimes(3);
		expect(mockRequest.mock.calls[0][0]).toEqual(expect.objectContaining({ headers: {} }));

		for (const path of [
			'https://evil.example',
			'/wcpos/v1/../../wp-json/wp/v2/users',
			'/wcpos/v1/%2e%2e/x',
			'/wcpos/v1//x',
			'/wcpos/v1/x?y=1',
			'/wcpos/v1/%5c..%5cx',
			'/wcpos/v1/x&rest_route=/other/v1/action',
			'/wcpos/v1/x%26rest_route=/other/v1/action',
		]) {
			await expect(
				result.current['http.proxy']({ method: 'GET', path, query: {} })
			).rejects.toMatchObject({ code: 'bad_request' });
		}
	});

	it('rejects a query that overrides the plain-permalink REST route', async () => {
		const { result } = renderHook(() => useHostCapabilities(jest.fn(), WIDE));

		await expect(
			result.current['http.proxy']({
				method: 'GET',
				path: '/wcpos/v1/orders',
				query: { rest_route: '/wp/v2/users' },
			})
		).rejects.toMatchObject({ code: 'bad_request' });
		expect(mockRequest).not.toHaveBeenCalled();
	});

	it('http.proxy strips x-http-method-override', async () => {
		const { result } = renderHook(() => useHostCapabilities(jest.fn(), WIDE));

		await act(async () => {
			await result.current['http.proxy']({
				method: 'GET',
				path: '/wcpos/v1/settings',
				headers: {
					'X-HTTP-Method-Override': 'DELETE',
					'x-http-method': 'DELETE',
					'x-wp-nonce': 'kept',
				},
			});
		});

		expect(mockRequest).toHaveBeenCalledTimes(1);
		expect(mockRequest.mock.calls[0][0]).toEqual(
			expect.objectContaining({ method: 'GET', headers: { 'x-wp-nonce': 'kept' } })
		);
	});

	it('http.proxy refuses a _method query override', async () => {
		const { result } = renderHook(() => useHostCapabilities(jest.fn(), WIDE));

		await expect(
			result.current['http.proxy']({
				method: 'GET',
				path: '/wcpos/v1/settings',
				query: { _method: 'DELETE' },
			})
		).rejects.toMatchObject({ code: 'bad_request' });
		expect(mockRequest).not.toHaveBeenCalled();
	});

	it('refuses query keys that are not plain letters, digits, _ or -', async () => {
		const { result } = renderHook(() => useHostCapabilities(jest.fn(), WIDE));
		for (const query of [
			{ '.method': 'DELETE' },
			{ 'rest.route': '/other/v1' },
			{ 'rest route': '/x' },
			{ 'a[b]': '1' },
			{ '': '1' },
		]) {
			await expect(
				result.current['http.proxy']({ method: 'GET', path: '/wcpos/v1/settings', query })
			).rejects.toMatchObject({ code: 'bad_request' });
			expect(mockRequest).not.toHaveBeenCalled();
		}
		await result.current['http.proxy']({
			method: 'GET',
			path: '/wcpos/v1/settings',
			query: { per_page: 10, 'order-by': 'id', page2: 1 },
		});
		expect(mockRequest).toHaveBeenCalledWith(
			expect.objectContaining({ url: '/wcpos/v1/settings?per_page=10&order-by=id&page2=1' })
		);
	});

	it('limits each mini-app to its declared methods and paths', async () => {
		const { result } = renderHook(() =>
			useHostCapabilities(jest.fn(), MINI_APP_PROXY_SCOPES['printer-wizard'])
		);
		for (const payload of [
			{ method: 'GET', path: '/wcpos/v1/settings/general' },
			{ method: 'GET', path: '/wcpos/v1/settings' },
			{ path: '/wcpos/v1/settings/general' },
			{ method: 'get', path: '/wcpos/v1/settings/general' },
		]) {
			mockRequest.mockClear();
			await result.current['http.proxy'](payload);
			expect(mockRequest).toHaveBeenCalledTimes(1);
			expect(mockRequest).toHaveBeenCalledWith(
				expect.objectContaining({ method: 'GET', url: payload.path })
			);
		}
		for (const payload of [
			{ method: 'POST', path: '/wcpos/v1/settings/general' },
			{ method: 'DELETE', path: '/wcpos/v1/settings/general' },
			{ method: 'GET', path: '/wcpos/v1/settingsx' },
			{ method: 'GET', path: '/wcpos/v1/orders' },
			{ method: 'GET', path: '/wc/v3/orders' },
			{ method: 'GET', path: '/wp/v2/users' },
			{ method: 'GET', path: '/wcpos/v1/settings%2fgeneral' },
		]) {
			mockRequest.mockClear();
			await expect(result.current['http.proxy'](payload)).rejects.toMatchObject({
				code: 'capability_denied',
			});
			expect(mockRequest).not.toHaveBeenCalled();
		}
	});

	it('refuses every proxy request when the mini-app has no scope', async () => {
		const { result } = renderHook(() => useHostCapabilities(jest.fn(), undefined));
		await expect(
			result.current['http.proxy']({ method: 'GET', path: '/wcpos/v1/settings/general' })
		).rejects.toMatchObject({ code: 'capability_denied' });
		expect(mockRequest).not.toHaveBeenCalled();
	});

	it('the printer wizard scope is GET-only under settings', () => {
		expect(MINI_APP_PROXY_SCOPES['printer-wizard']).toEqual({
			methods: ['GET'],
			paths: ['/wcpos/v1/settings/'],
		});
	});

	it('opens only https external URLs', async () => {
		const { result } = renderHook(() => useHostCapabilities(jest.fn(), WIDE));

		await act(async () => {
			await result.current['ui.openExternal']({ url: 'https://example.com' });
		});
		expect(mockOpenExternalURL).toHaveBeenCalledWith('https://example.com');
		await expect(
			result.current['ui.openExternal']({ url: 'http://example.com' })
		).rejects.toMatchObject({ code: 'bad_request' });
	});
});
