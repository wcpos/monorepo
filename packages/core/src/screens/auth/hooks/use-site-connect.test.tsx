/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { createTestT } from '../../../../jest/translate';
import { upsertSiteData } from '../../../utils/site-writes';
import { connectionAddressOf, normalizeSiteAddress, useSiteConnect } from './use-site-connect';

const mockT = createTestT();
const mockFindOneFix = jest.fn();
const mockTestAuthorizationMethod = jest.fn();
const mockRunConnectCompatibilityProbes = jest.fn();
const mockSavedSite = { name: 'Test Store', getLatest: jest.fn() };
mockSavedSite.getLatest.mockReturnValue(mockSavedSite);
const mockUserLatest = { sites: [] as string[], incrementalUpdate: jest.fn() };
const mockDiscoverWpApiUrl = jest.fn(async () => 'https://example.com/wp-json/');
const mockDiscoverApiEndpoints = jest.fn(async () => ({
	endpoints: { wcpos_api_url: 'https://example.com/wp-json/wcpos/v2/' },
	siteData: { uuid: 'site-uuid', url: 'https://example.com', wcpos_version: '2.0.0' },
}));

jest.mock('../../../contexts/app-state', () => ({
	useAppState: () => ({
		user: {
			getLatest: () => mockUserLatest,
		},
		userDB: {
			sites: {
				parseRestResponse: (data: unknown) => data,
				findOneFix: (uuid: string) => ({ exec: () => mockFindOneFix(uuid) }),
			},
		},
	}),
}));
jest.mock('../../../contexts/app-state/hydration-steps', () => ({
	testAuthorizationMethod: (...args: unknown[]) => mockTestAuthorizationMethod(...args),
	runConnectCompatibilityProbes: (...args: unknown[]) => mockRunConnectCompatibilityProbes(...args),
}));
jest.mock('../../../contexts/translations', () => ({
	useT: () => mockT,
}));
jest.mock('./use-api-discovery', () => ({
	useApiDiscovery: () => ({ discoverApiEndpoints: mockDiscoverApiEndpoints }),
}));
jest.mock('./use-url-discovery', () => ({
	useUrlDiscovery: () => ({ discoverWpApiUrl: mockDiscoverWpApiUrl }),
}));
jest.mock('../../../utils/site-writes', () => ({
	upsertSiteData: jest.fn(async () => mockSavedSite),
}));

describe('normalizeSiteAddress', () => {
	it.each([
		['https://example.com', 'http://example.com', true],
		['https://Example.com', 'https://example.com', true],
		['https://example.com/', 'https://example.com', true],
		['https://example.com/staging', 'https://example.com', false],
		['https://example.com/Staging', 'https://example.com/staging', false],
	])('compares %s with %s: same address = %s', (saved, incoming, same) => {
		expect(normalizeSiteAddress(saved) === normalizeSiteAddress(incoming)).toBe(same);
	});
});

describe('connectionAddressOf', () => {
	it.each([
		['https://example.com/wp-json/wcpos/v2/', 'example.com'],
		['http://Example.com/?rest_route=/wcpos/v2/', 'example.com'],
		['https://example.com/staging/wp-json/wcpos/v2/', 'example.com/staging'],
		['https://192.168.1.5:8080/wp-json/wcpos/v2/', '192.168.1.5:8080'],
		[undefined, ''],
	])('reduces %s to the address reached, %s', (apiUrl, address) => {
		expect(connectionAddressOf(apiUrl)).toBe(address);
	});
});

describe('useSiteConnect', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockFindOneFix.mockResolvedValue(null);
		mockRunConnectCompatibilityProbes.mockResolvedValue({ blocking: null, warnings: [] });
	});

	it.each([
		// Inline copy is TRANSLATED; dedicated keys
		// for the two anchor codes, the generic host line for classifier codes.
		[ERROR_CODES.AUTH_TOKEN_BLOCKED_BY_HOST, 'auth.server_blocks_login_token'],
		[ERROR_CODES.BOT_CHALLENGE_BLOCKING_API, 'auth.host_compatibility_problem'],
		[ERROR_CODES.REST_TRANSPORT_BLOCKED, 'auth.store_rest_api_unreachable'],
	] as const)('exposes and resets the %s coded connect error', async (code, messageKey) => {
		mockTestAuthorizationMethod.mockResolvedValue({ ok: false, code });
		const { result } = renderHook(() => useSiteConnect());

		await act(async () => {
			await result.current.onConnect('https://example.com');
		});

		expect(result.current.error).toBe(mockT(messageKey));
		expect(result.current.errorCode).toBe(code);

		act(() => result.current.reset());
		expect(result.current.error).toBeNull();
		expect(result.current.errorCode).toBeNull();
	});

	it.each([
		[{ ok: false, code: null, timedOut: true }, 'auth.site_took_too_long_to_respond'],
		[{ ok: false, code: null }, 'auth.failed_to_test_authorization_methods'],
	] as const)('uses the translated %s connect error: %s', async (authResult, messageKey) => {
		mockTestAuthorizationMethod.mockResolvedValue(authResult);
		const { result } = renderHook(() => useSiteConnect());

		await act(async () => {
			await result.current.onConnect('https://example.com');
		});

		expect(result.current.error).toBe(mockT(messageKey));
		expect(result.current.errorCode).toBeNull();
		expect(result.current.status).toBe('error');
	});

	it('exposes a blocking shared-cache replay with the generic translated host message', async () => {
		mockTestAuthorizationMethod.mockResolvedValue({
			ok: true,
			useJwtAsParam: false,
			useRestRouteParam: false,
		});
		mockRunConnectCompatibilityProbes.mockResolvedValue({
			blocking: ERROR_CODES.CACHE_SHARED_REPLAY,
			warnings: [],
		});
		const { result } = renderHook(() => useSiteConnect());

		await act(async () => {
			await result.current.onConnect('https://example.com');
		});

		expect(result.current.error).toBe(mockT('auth.host_compatibility_problem'));
		expect(result.current.errorCode).toBe(ERROR_CODES.CACHE_SHARED_REPLAY);
	});

	it('refuses a saved identity at another address without writing site data', async () => {
		mockFindOneFix.mockResolvedValue({ url: 'https://live.example.com', name: 'Live' });
		mockDiscoverApiEndpoints.mockResolvedValueOnce({
			endpoints: { wcpos_api_url: 'https://staging.example.com/wp-json/wcpos/v2/' },
			siteData: { uuid: 'site-uuid', url: 'https://staging.example.com', wcpos_version: '2.0.0' },
		});
		mockTestAuthorizationMethod.mockResolvedValue({ ok: true });
		const { result } = renderHook(() => useSiteConnect());

		await act(async () => {
			expect(await result.current.onConnect('https://staging.example.com')).toBeNull();
		});

		expect(mockFindOneFix).toHaveBeenCalledWith('site-uuid');
		expect(result.current.errorCode).toBe('AUTH341');
		expect(result.current.error).toContain('Live');
		expect(result.current.status).toBe('error');
		expect(upsertSiteData).not.toHaveBeenCalled();
		expect(mockUserLatest.incrementalUpdate).not.toHaveBeenCalled();
	});

	it('refuses a raw copy that still reports the saved store as its home but was reached at another address', async () => {
		// A database copy without a search-replace: the REST index reports the
		// live store's url and uuid, only the address the connect reached differs.
		mockFindOneFix.mockResolvedValue({
			url: 'https://example.com',
			wcpos_api_url: 'https://example.com/wp-json/wcpos/v2/',
			name: 'Live',
		});
		mockDiscoverApiEndpoints.mockResolvedValueOnce({
			endpoints: { wcpos_api_url: 'https://staging.example.com/wp-json/wcpos/v2/' },
			siteData: { uuid: 'site-uuid', url: 'https://example.com', wcpos_version: '2.0.0' },
		});
		mockTestAuthorizationMethod.mockResolvedValue({ ok: true });
		const { result } = renderHook(() => useSiteConnect());

		await act(async () => {
			expect(await result.current.onConnect('https://staging.example.com')).toBeNull();
		});

		expect(result.current.errorCode).toBe('AUTH341');
		expect(upsertSiteData).not.toHaveBeenCalled();
	});

	it('keeps merging a saved identity at the same address despite scheme, host case and permalink style', async () => {
		mockFindOneFix.mockResolvedValue({
			url: 'http://Example.com/',
			wcpos_api_url: 'http://Example.com/?rest_route=/wcpos/v2/',
			name: 'Live',
		});
		mockTestAuthorizationMethod.mockResolvedValue({ ok: true });
		const { result } = renderHook(() => useSiteConnect());

		await act(async () => {
			expect(await result.current.onConnect('https://example.com')).toBe(mockSavedSite);
		});

		expect(upsertSiteData).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ uuid: 'site-uuid', url: 'https://example.com' })
		);
		expect(result.current.error).toBeNull();
		expect(result.current.errorCode).toBeNull();
		expect(result.current.status).toBe('success');
	});

	it('continues connecting when compatibility probes return only warnings', async () => {
		mockTestAuthorizationMethod.mockResolvedValue({
			ok: true,
			useJwtAsParam: false,
			useRestRouteParam: true,
		});
		mockRunConnectCompatibilityProbes.mockResolvedValue({
			blocking: null,
			warnings: [ERROR_CODES.SEARCH_BLOCKED_BY_WAF],
		});
		const { result } = renderHook(() => useSiteConnect());

		await act(async () => {
			await result.current.onConnect('https://example.com');
		});

		expect(mockRunConnectCompatibilityProbes).toHaveBeenCalledWith({
			pathBase: 'https://example.com/wp-json/wcpos/v2/',
			pathRoot: 'https://example.com/wp-json/',
			useRestRouteParam: true,
		});
		expect(result.current.error).toBeNull();
		expect(result.current.status).toBe('success');
		expect(result.current.errorCode).toBeNull();
	});
});
