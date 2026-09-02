/** @jest-environment jsdom */
import { renderHook, waitFor } from '@testing-library/react';

import { resetCatalogCacheForTests, useMiniAppCatalog } from './catalog';

const mockFetch = jest.fn();

describe('useMiniAppCatalog', () => {
	beforeEach(() => {
		resetCatalogCacheForTests();
		mockFetch.mockReset();
		Object.defineProperty(globalThis, 'fetch', { value: mockFetch, configurable: true });
	});

	it('returns the seed synchronously and keeps it when fetch fails', async () => {
		mockFetch.mockRejectedValue(new Error('offline'));

		const { result } = renderHook(() => useMiniAppCatalog());

		expect(result.current.map(({ id }) => id)).toEqual(['printer-wizard']);
		await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
		expect(result.current.map(({ id }) => id)).toEqual(['printer-wizard']);
	});

	it('filters fetched entries through the bundled allowlist', async () => {
		mockFetch.mockResolvedValue({
			ok: true,
			json: async () => ({
				wcpos: 1,
				miniApps: [
					{
						id: 'printer-wizard',
						title: { en: 'Remote wizard' },
						url: 'https://mini-app.example/printer',
						capabilities: [],
						minAppVersion: '1.10.7',
						entry: [],
						platforms: ['web'],
					},
					{
						id: 'unknown',
						title: { en: 'Unknown' },
						url: 'https://mini-app.example/unknown',
						capabilities: [],
						minAppVersion: '1.10.7',
						entry: [],
						platforms: ['web'],
					},
				],
			}),
		} as Response);

		const { result } = renderHook(() => useMiniAppCatalog());

		await waitFor(() => expect(result.current[0]?.title.en).toBe('Remote wizard'));
		expect(result.current.map(({ id }) => id)).toEqual(['printer-wizard']);
	});
});
