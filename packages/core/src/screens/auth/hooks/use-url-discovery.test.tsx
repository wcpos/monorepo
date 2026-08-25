/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

import { useUrlDiscovery } from './use-url-discovery';

const mockHead = jest.fn();

jest.mock('@wcpos/hooks/use-http-client', () => ({
	useHttpClient: () => ({ head: mockHead }),
	PREFLIGHT_BLOCK: {
		ASLEEP: 'preflight-asleep',
		OFFLINE: 'preflight-offline',
		AUTH_REQUIRED: 'preflight-auth-required',
		RECOVERING: 'preflight-recovering',
	},
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

/**
 * The shape `useHttpClient` throws when its pre-flight check rejects a request:
 * a bare Error with no `response`, because nothing was ever sent.
 */
const preFlightBlock = (blockCode: string, reason: string) =>
	Object.assign(new Error(reason), { isPreFlightBlocked: true, blockCode });

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

		expect(mockHead).toHaveBeenCalledWith('https://example.com', {
			timeout: 10_000,
			unauthenticated: true,
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
			unauthenticated: true,
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
	/**
	 * The 2026-08-25 desktop failure (main.log 17:18): a saved store whose refresh
	 * token had expired latched `authFailed` process-wide during boot. Every store
	 * the cashier then typed on the Connect screen — demo.wcpos.com, dev-pro,
	 * dev-free alike — came back "Site does not seem to be a WordPress site", with
	 * no request in the transport log because none was ever sent.
	 */
	it('marks the discovery probes unauthenticated so a dead session cannot block them', async () => {
		mockHead.mockResolvedValue({
			status: 200,
			headers: { link: '<https://example.com/wp-json/>; rel="https://api.w.org/"' },
		});

		const { result } = renderHook(() => useUrlDiscovery());
		await result.current.discoverWpApiUrl('https://example.com');

		expect(mockHead).toHaveBeenCalledWith('https://example.com', {
			timeout: 10_000,
			unauthenticated: true,
		});
	});

	it('does not blame the site when the request never left the device', async () => {
		mockHead.mockRejectedValue(
			preFlightBlock('preflight-auth-required', 'Please log in to continue')
		);

		const { result } = renderHook(() => useUrlDiscovery());
		await expect(result.current.discoverWpApiUrl('https://example.com')).rejects.toThrow(
			"The app couldn't send the request — please try again"
		);
	});

	it('reports the offline block as a connection problem, not a bad site', async () => {
		mockHead.mockRejectedValue(preFlightBlock('preflight-offline', 'No internet connection'));

		const { result } = renderHook(() => useUrlDiscovery());
		await expect(result.current.discoverWpApiUrl('https://example.com')).rejects.toThrow(
			'No internet connection'
		);
	});
});
