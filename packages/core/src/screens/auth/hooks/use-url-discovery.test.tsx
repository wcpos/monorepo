/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

import { useUrlDiscovery } from './use-url-discovery';

const mockHead = jest.fn();

jest.mock('@wcpos/hooks/use-http-client', () => ({
	useHttpClient: () => ({ head: mockHead }),
}));
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ debug: jest.fn(), error: jest.fn() }),
}));
jest.mock('../../../contexts/translations', () => {
	const { createTestT } = jest.requireActual<typeof import('../../../../jest/translate')>(
		'../../../../jest/translate'
	);
	return { useT: () => createTestT() };
});

/** Axios reports a request that exceeded `timeout` with code ECONNABORTED. */
const timeoutError = () =>
	Object.assign(new Error('timeout of 10000ms exceeded'), { code: 'ECONNABORTED' });

describe('useUrlDiscovery', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('discovers the API URL from the Link header with a bounded probe', async () => {
		mockHead.mockResolvedValue({
			status: 200,
			headers: { link: '<https://example.com/wp-json/>; rel="https://api.w.org/"' },
		});

		const { result } = renderHook(() => useUrlDiscovery());
		await expect(result.current.discoverWpApiUrl('https://example.com')).resolves.toBe(
			'https://example.com/wp-json/'
		);

		// EXACT options, quietErrors included: a probe asking "is this a
		// WordPress site?" must not log "no" as an application error. Dropping
		// the flag put a typo'd store URL in the error log under a CLIENT999
		// fallback and raised a dev-client redbox over the connect screen
		// (E2E flow 01, iOS, 2026-08-29).
		expect(mockHead).toHaveBeenCalledWith('https://example.com', {
			timeout: 10_000,
			quietErrors: true,
		});
	});

	it('falls back to /wp-json/ when the front-page probe hangs past its timeout', async () => {
		// The monorepo#1155 failure shape: the site root never responds while the
		// REST API still answers. Without the timeout this hung forever.
		mockHead.mockRejectedValueOnce(timeoutError());
		mockHead.mockResolvedValueOnce({ status: 200, headers: {} });

		const { result } = renderHook(() => useUrlDiscovery());
		await expect(result.current.discoverWpApiUrl('https://example.com')).resolves.toBe(
			'https://example.com/wp-json/'
		);

		expect(mockHead).toHaveBeenNthCalledWith(2, 'https://example.com/wp-json/', {
			timeout: 10_000,
			quietErrors: true,
		});
	});

	it('reports a timeout instead of "not a WordPress site" when both probes hang', async () => {
		mockHead.mockRejectedValue(timeoutError());

		const { result } = renderHook(() => useUrlDiscovery());
		await expect(result.current.discoverWpApiUrl('https://example.com')).rejects.toThrow(
			'The site took too long to respond — check the server and try again'
		);
	});

	it('still reports a non-WordPress site when probes answer but find nothing', async () => {
		mockHead.mockRejectedValueOnce(
			Object.assign(new Error('Not Found'), { response: { status: 404, headers: {} } })
		);
		mockHead.mockRejectedValueOnce(
			Object.assign(new Error('Not Found'), { response: { status: 404, headers: {} } })
		);

		const { result } = renderHook(() => useUrlDiscovery());
		await expect(result.current.discoverWpApiUrl('https://example.com')).rejects.toThrow(
			'Site does not seem to be a WordPress site'
		);
	});
});
