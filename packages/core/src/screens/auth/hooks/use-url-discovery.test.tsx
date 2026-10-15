/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

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

		// EXACT options, both flags included. quietErrors: a probe asking "is
		// this a WordPress site?" must not log "no" as an application error —
		// dropping it put a typo'd store URL in the error log under a CLIENT999
		// fallback and raised a dev-client redbox over the connect screen
		// (E2E flow 01, iOS, 2026-08-29). unauthenticated: the probe sends no
		// credentials, so a dead session's authFailed latch must not block it.
		expect(mockHead).toHaveBeenCalledWith('https://example.com', {
			timeout: 10_000,
			quietErrors: true,
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
			quietErrors: true,
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

	it('reports a bot challenge when both probes are challenged', async () => {
		mockHead.mockRejectedValue(
			Object.assign(new Error('Request failed with status code 403'), {
				response: {
					status: 403,
					headers: { 'cf-mitigated': 'challenge', 'content-type': 'text/html; charset=UTF-8' },
				},
			})
		);

		const { result } = renderHook(() => useUrlDiscovery());
		await expect(result.current.discoverWpApiUrl('https://example.com')).rejects.toMatchObject({
			message:
				"This store's hosting setup is blocking the app — the details page names the exact cause and fix.",
			errorCode: ERROR_CODES.BOT_CHALLENGE_BLOCKING_API,
		});
	});

	it('recognises a challenge whose header name is not lower-cased', async () => {
		mockHead.mockRejectedValue(
			Object.assign(new Error('Request failed with status code 403'), {
				response: {
					status: 403,
					headers: { 'CF-Mitigated': 'Challenge', 'Content-Type': 'text/html' },
				},
			})
		);

		const { result } = renderHook(() => useUrlDiscovery());
		await expect(result.current.discoverWpApiUrl('https://example.com')).rejects.toMatchObject({
			errorCode: ERROR_CODES.BOT_CHALLENGE_BLOCKING_API,
		});
	});

	it('discovers the fallback URL when only the Link-header probe is challenged', async () => {
		mockHead.mockRejectedValueOnce(
			Object.assign(new Error('Request failed with status code 403'), {
				response: {
					status: 403,
					headers: { 'cf-mitigated': 'challenge', 'content-type': 'text/html; charset=UTF-8' },
				},
			})
		);
		mockHead.mockResolvedValueOnce({ status: 200, headers: {} });

		const { result } = renderHook(() => useUrlDiscovery());
		await expect(result.current.discoverWpApiUrl('https://example.com')).resolves.toBe(
			'https://example.com/wp-json/'
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
			quietErrors: true,
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
