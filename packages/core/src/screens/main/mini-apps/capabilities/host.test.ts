/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';

import { useHostCapabilities } from './host';

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
		const { result } = renderHook(() => useHostCapabilities(jest.fn()));

		for (const path of ['/wcpos/v1/settings', '/wc/v3/orders', '/wp/v2/users']) {
			await act(async () => {
				await result.current['http.proxy']({ method: 'GET', path, query: {}, body: null });
			});
		}
		expect(mockRequest).toHaveBeenCalledTimes(3);

		await expect(
			result.current['http.proxy']({ method: 'GET', path: 'https://evil.example', query: {} })
		).rejects.toMatchObject({ code: 'bad_request' });
	});

	it('opens only https external URLs', async () => {
		const { result } = renderHook(() => useHostCapabilities(jest.fn()));

		await act(async () => {
			await result.current['ui.openExternal']({ url: 'https://example.com' });
		});
		expect(mockOpenExternalURL).toHaveBeenCalledWith('https://example.com');
		await expect(
			result.current['ui.openExternal']({ url: 'http://example.com' })
		).rejects.toMatchObject({ code: 'bad_request' });
	});
});
