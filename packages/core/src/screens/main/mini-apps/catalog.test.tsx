/** @jest-environment jsdom */
import { renderHook, waitFor } from '@testing-library/react';

import { MINI_APP_ORIGIN, resetCatalogCacheForTests, useMiniAppCatalog } from './catalog';

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
						url: `${MINI_APP_ORIGIN}/printer-wizard/index.html`,
						capabilities: [],
						minAppVersion: '1.10.7',
						entry: [],
						platforms: ['web'],
					},
					{
						id: 'unknown',
						title: { en: 'Unknown' },
						url: `${MINI_APP_ORIGIN}/unknown/index.html`,
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

	it('keeps the bundled entry when the remote one is malformed or off-origin', async () => {
		mockFetch.mockResolvedValue({
			ok: true,
			json: async () => ({
				wcpos: 1,
				miniApps: [
					{ id: 'printer-wizard', title: { en: 'Broken' }, url: `${MINI_APP_ORIGIN}/x/` },
					{
						id: 'printer-wizard',
						title: { en: 'Elsewhere' },
						url: 'https://elsewhere.example/printer-wizard/',
						capabilities: [],
						minAppVersion: '1.10.6',
						entry: [],
						platforms: ['web'],
					},
				],
			}),
		} as Response);

		const { result } = renderHook(() => useMiniAppCatalog());

		await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
		expect(result.current).toHaveLength(1);
		expect(result.current[0].title.en).toBe('Printer setup wizard');
	});
});
