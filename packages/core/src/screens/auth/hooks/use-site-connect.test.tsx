/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import {
	connectionAddressOf,
	normalizeSiteAddress,
	saveConnectedSite,
	SiteIdentityClashError,
} from '@wcpos/query/user-db';

import { createTestT } from '../../../../jest/translate';
import { URL_IMPLEMENTATIONS, withGlobalUrl } from '../../../../jest/url-implementations';
import { useSiteConnect } from './use-site-connect';

const mockT = createTestT();
const mockTestAuthorizationMethod = jest.fn();
const mockRunConnectCompatibilityProbes = jest.fn();
const mockSavedSite = { name: 'Test Store', getLatest: jest.fn() };
mockSavedSite.getLatest.mockReturnValue(mockSavedSite);
const mockUser = {};
const mockUserDB = {};
const mockDiscoverWpApiUrl = jest.fn(async () => 'https://example.com/wp-json/');
const mockDiscoverApiEndpoints = jest.fn(async () => ({
	endpoints: { wcpos_api_url: 'https://example.com/wp-json/wcpos/v2/' },
	siteData: { uuid: 'site-uuid', url: 'https://example.com', wcpos_version: '2.0.0' },
}));

jest.mock('../../../contexts/app-state', () => ({
	useAppState: () => ({
		user: mockUser,
		userDB: mockUserDB,
	}),
}));
jest.mock('../../../contexts/app-state/connect-probes', () => ({
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
jest.mock('expo-crypto', () => ({}));
jest.mock('@wcpos/query/user-db', () => ({
	...jest.requireActual('@wcpos/query/user-db'),
	saveConnectedSite: jest.fn(async () => mockSavedSite),
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

	describe.each(URL_IMPLEMENTATIONS)('%s', (_, impl) => {
		withGlobalUrl(impl);

		it.each([
			['https://münchen-laden.de/', 'xn--mnchen-laden-dlb.de', true],
			['https://Bücher.example/shop', 'https://xn--bcher-kva.example/shop/', true],
			['https://bücher.example:443/shop', 'https://xn--bcher-kva.example:443/shop', true],
		])('compares %s with %s: same address = %s', (saved, incoming, same) => {
			expect(normalizeSiteAddress(saved) === normalizeSiteAddress(incoming)).toBe(same);
		});
	});
});

describe('connectionAddressOf', () => {
	it.each([
		['https://example.com/wp-json/wcpos/v2/', 'example.com'],
		['http://Example.com/?rest_route=/wcpos/v2/', 'example.com'],
		['https://example.com/staging/wp-json/wcpos/v2/', 'example.com/staging'],
		['https://192.168.1.5:8080/wp-json/wcpos/v2/', '192.168.1.5:8080'],
		['https://münchen-laden.de/wp-json/', 'xn--mnchen-laden-dlb.de'],
		[undefined, ''],
	])('reduces %s to the address reached, %s', (apiUrl, address) => {
		expect(connectionAddressOf(apiUrl)).toBe(address);
	});
});

describe('useSiteConnect', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.mocked(saveConnectedSite).mockResolvedValue(mockSavedSite as never);
		mockRunConnectCompatibilityProbes.mockResolvedValue({
			blocking: null,
			warnings: [],
			useCacheBuster: false,
		});
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
			useCacheBuster: false,
		});
		const { result } = renderHook(() => useSiteConnect());

		await act(async () => {
			await result.current.onConnect('https://example.com');
		});

		expect(result.current.error).toBe(mockT('auth.host_compatibility_problem'));
		expect(result.current.errorCode).toBe(ERROR_CODES.CACHE_SHARED_REPLAY);
	});

	it('refuses a saved identity at another address without writing site data', async () => {
		jest.mocked(saveConnectedSite).mockRejectedValueOnce(new SiteIdentityClashError('Live'));
		mockDiscoverApiEndpoints.mockResolvedValueOnce({
			endpoints: { wcpos_api_url: 'https://staging.example.com/wp-json/wcpos/v2/' },
			siteData: { uuid: 'site-uuid', url: 'https://staging.example.com', wcpos_version: '2.0.0' },
		});
		mockTestAuthorizationMethod.mockResolvedValue({ ok: true });
		const { result } = renderHook(() => useSiteConnect());

		await act(async () => {
			expect(await result.current.onConnect('https://staging.example.com')).toBeNull();
		});

		expect(saveConnectedSite).toHaveBeenCalledWith(
			mockUserDB,
			mockUser,
			expect.objectContaining({ uuid: 'site-uuid' }),
			'https://staging.example.com/wp-json/wcpos/v2/'
		);
		expect(result.current.errorCode).toBe('AUTH341');
		expect(result.current.error).toContain('Live');
		expect(result.current.status).toBe('error');
	});

	it('refuses a raw copy that still reports the saved store as its home but was reached at another address', async () => {
		// A database copy without a search-replace: the REST index reports the
		// live store's url and uuid, only the address the connect reached differs.
		jest.mocked(saveConnectedSite).mockRejectedValueOnce(new SiteIdentityClashError('Live'));
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
	});

	it('keeps merging a saved identity at the same address despite scheme, host case and permalink style', async () => {
		mockTestAuthorizationMethod.mockResolvedValue({ ok: true });
		const { result } = renderHook(() => useSiteConnect());

		await act(async () => {
			expect(await result.current.onConnect('https://example.com')).toBe(mockSavedSite);
		});

		expect(saveConnectedSite).toHaveBeenCalledWith(
			mockUserDB,
			mockUser,
			expect.objectContaining({ uuid: 'site-uuid', url: 'https://example.com' }),
			'https://example.com/wp-json/wcpos/v2/'
		);
		expect(result.current.error).toBeNull();
		expect(result.current.errorCode).toBeNull();
		expect(result.current.status).toBe('success');
	});

	it.each([false, true])(
		'persists cache-buster mode %s when probes return only warnings',
		async (useCacheBuster) => {
			mockTestAuthorizationMethod.mockResolvedValue({
				ok: true,
				useJwtAsParam: false,
				useRestRouteParam: true,
			});
			mockRunConnectCompatibilityProbes.mockResolvedValue({
				blocking: null,
				warnings: [ERROR_CODES.SEARCH_BLOCKED_BY_WAF],
				useCacheBuster,
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
			expect(saveConnectedSite).toHaveBeenCalledWith(
				mockUserDB,
				mockUser,
				expect.objectContaining({ use_cache_buster: useCacheBuster }),
				'https://example.com/wp-json/wcpos/v2/'
			);
			expect(result.current.errorCode).toBeNull();
		}
	);
});
