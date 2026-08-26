/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useApiDiscovery } from './use-api-discovery';

const mockGet = jest.fn();

jest.mock('@wcpos/hooks/use-http-client', () => ({
	useHttpClient: () => ({ get: mockGet }),
}));
const mockLoggerError = jest.fn();
jest.mock('@wcpos/utils/logger', () => ({
	getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
	getLogger: () => ({
		debug: jest.fn(),
		error: (...args: unknown[]) => mockLoggerError(...args),
		info: jest.fn(),
		warn: jest.fn(),
	}),
}));
jest.mock('../../../contexts/translations', () => {
	const { createTestT } = jest.requireActual<typeof import('../../../../jest/translate')>(
		'../../../../jest/translate'
	);
	return { useT: () => createTestT() };
});

const siteData = {
	uuid: 'site-uuid',
	authentication: {
		wcpos: { endpoints: { authorization: 'https://example.com/wp-admin/authorize' } },
	},
	description: 'Example store',
	gmt_offset: '0',
	home: 'https://example.com',
	name: 'Example Store',
	namespaces: ['wc/v3', 'wcpos/v2'],
	routes: {},
	site_logo: '',
	timezone_string: 'UTC',
	url: 'https://example.com',
	wc_version: '10.0.0',
	wcpos_version: '1.9.0',
	_links: {},
};

const siteRequestOptions = {
	params: { wcpos: 1, wcpos_protocol: 2, wcpos_client: 'web/0.0.0' },
	timeout: 15_000,
};
const requestOptions = { params: { wcpos: 1 }, timeout: 15_000 };

describe('useApiDiscovery', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockGet.mockReset();
	});

	it.each([
		['https://example.com/wp-json/', 'https://example.com/wp-json/wcpos/v2/site'],
		['https://example.com/?rest_route=/', 'https://example.com/?rest_route=/wcpos/v2/site'],
	])('discovers the API from the light endpoint for %s', async (wpApiUrl, lightApiUrl) => {
		mockGet.mockResolvedValue({ data: siteData });

		const { result } = renderHook(() => useApiDiscovery());
		await act(async () => {
			await expect(result.current.discoverApiEndpoints(wpApiUrl)).resolves.toMatchObject({
				siteData,
			});
		});

		expect(mockGet).toHaveBeenCalledWith(lightApiUrl, siteRequestOptions);
		expect(mockGet).not.toHaveBeenCalledWith(wpApiUrl, expect.anything());
	});

	it('falls back to the API index when the light endpoint returns 404', async () => {
		const wpApiUrl = 'https://example.com/wp-json/';
		mockGet
			.mockRejectedValueOnce({ response: { status: 404 } })
			.mockResolvedValueOnce({ data: siteData });

		const { result } = renderHook(() => useApiDiscovery());
		await act(async () => {
			await expect(result.current.discoverApiEndpoints(wpApiUrl)).resolves.toMatchObject({
				siteData,
			});
		});

		expect(mockGet).toHaveBeenNthCalledWith(
			1,
			'https://example.com/wp-json/wcpos/v2/site',
			siteRequestOptions
		);
		expect(mockGet).toHaveBeenNthCalledWith(2, wpApiUrl, requestOptions);
	});

	it.each(['ECONNABORTED', 'ETIMEDOUT'])(
		'reports the existing %s timeout error without falling back to the API index',
		async (code) => {
			const wpApiUrl = 'https://example.com/wp-json/';
			mockGet.mockRejectedValue(Object.assign(new Error('timeout of 15000ms exceeded'), { code }));

			const { result } = renderHook(() => useApiDiscovery());
			await act(async () => {
				await expect(result.current.discoverApiEndpoints(wpApiUrl)).rejects.toMatchObject({
					name: 'ApiDiscoveryError',
					message: 'The site took too long to respond — check the server and try again',
				});
			});

			expect(result.current.error).toBe(
				'The site took too long to respond — check the server and try again'
			);
			expect(mockGet).toHaveBeenCalledTimes(1);
			expect(mockGet).not.toHaveBeenCalledWith(wpApiUrl, expect.anything());
		}
	);

	it('reports the existing WooCommerce error for a light response missing wc/v3', async () => {
		mockGet.mockResolvedValue({
			data: { ...siteData, namespaces: ['wcpos/v2'] },
		});

		const { result } = renderHook(() => useApiDiscovery());
		await act(async () => {
			await expect(
				result.current.discoverApiEndpoints('https://example.com/wp-json/')
			).rejects.toThrow('WooCommerce API not found');
		});

		expect(result.current.error).toBe('WooCommerce API not found');
	});

	/**
	 * A released 1.9.x store registers `wcpos/v1` only. Calling that "API not
	 * found" sends the merchant hunting for a missing plugin; the actual fix is
	 * a plugin update, so the copy and the code have to say so.
	 */
	it('tells a store on an older plugin to update, not that the API is missing', async () => {
		mockGet.mockResolvedValue({
			data: { ...siteData, namespaces: ['wc/v3', 'wcpos/v1'], wcpos_version: '1.9.17' },
		});

		const { result } = renderHook(() => useApiDiscovery());
		await act(async () => {
			await expect(
				result.current.discoverApiEndpoints('https://example.com/wp-json/')
			).rejects.toMatchObject({
				message: 'Please update your WCPOS plugin',
				errorCode: ERROR_CODES.WCPOS_PLUGIN_OUTDATED,
			});
		});

		expect(result.current.error).toBe('Please update your WCPOS plugin');
	});

	/**
	 * The version alone is enough evidence the plugin is installed: a site can
	 * report `wcpos_version` while a security plugin hides the namespace list.
	 */
	it('treats a reported plugin version as an outdated plugin, not a missing one', async () => {
		mockGet.mockResolvedValue({
			data: { ...siteData, namespaces: ['wc/v3'], wcpos_version: '1.9.17' },
		});

		const { result } = renderHook(() => useApiDiscovery());
		await act(async () => {
			await expect(
				result.current.discoverApiEndpoints('https://example.com/wp-json/')
			).rejects.toMatchObject({ errorCode: ERROR_CODES.WCPOS_PLUGIN_OUTDATED });
		});
	});

	it('reports hidden routes, not an outdated plugin, when the version is compatible', async () => {
		mockGet.mockResolvedValue({
			data: { ...siteData, namespaces: ['wc/v3'], wcpos_version: '1.10.0' },
		});

		const { result } = renderHook(() => useApiDiscovery());
		await act(async () => {
			await expect(
				result.current.discoverApiEndpoints('https://example.com/wp-json/')
			).rejects.toMatchObject({ errorCode: ERROR_CODES.REST_ROUTE_MISSING });
		});
	});

	it('lets a compatible version override a visible legacy namespace', async () => {
		mockGet.mockResolvedValue({
			data: { ...siteData, namespaces: ['wc/v3', 'wcpos/v1'], wcpos_version: '1.10.0' },
		});

		const { result } = renderHook(() => useApiDiscovery());
		await act(async () => {
			await expect(
				result.current.discoverApiEndpoints('https://example.com/wp-json/')
			).rejects.toMatchObject({ errorCode: ERROR_CODES.REST_ROUTE_MISSING });
		});
	});

	it.each([
		['routes stripped from a compatible plugin', ['wc/v3'], '1.10.0'],
		['no WCPOS evidence at all', ['wc/v3'], undefined],
	])(
		'shows the merchant the API message, not the dev diagnosis (%s)',
		async (_case, namespaces, wcposVersion) => {
			// showToast with no toast.title makes the raw log message the merchant's
			// toast (logger/index.ts: `title: options.toast?.title ?? message`), and
			// the log message names one of the two faults this branch serves.
			const { wcpos_version, ...withoutVersion } = siteData;
			mockGet.mockResolvedValue({
				data: wcposVersion
					? { ...siteData, namespaces, wcpos_version: wcposVersion }
					: { ...withoutVersion, namespaces },
			});

			const { result } = renderHook(() => useApiDiscovery());
			await act(async () => {
				await expect(
					result.current.discoverApiEndpoints('https://example.com/wp-json/')
				).rejects.toMatchObject({ errorCode: ERROR_CODES.REST_ROUTE_MISSING });
			});

			const [, options] = mockLoggerError.mock.calls.at(-1) as [
				string,
				{ toast?: { title?: string } },
			];
			expect(options.toast?.title).toBe('WCPOS API not found');
		}
	);

	it('still reports a missing plugin when the store shows no WCPOS API at all', async () => {
		const { wcpos_version, ...withoutVersion } = siteData;
		mockGet.mockResolvedValue({
			data: { ...withoutVersion, namespaces: ['wc/v3'] },
		});

		const { result } = renderHook(() => useApiDiscovery());
		await act(async () => {
			await expect(
				result.current.discoverApiEndpoints('https://example.com/wp-json/')
			).rejects.toMatchObject({
				message: 'WCPOS API not found',
				errorCode: ERROR_CODES.REST_ROUTE_MISSING,
			});
		});

		expect(result.current.error).toBe('WCPOS API not found');
	});
});
