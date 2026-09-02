/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

const mockTestAuthorizationMethod = jest.fn();
const mockRunConnectCompatibilityProbes = jest.fn();
const mockSavedSite = { name: 'Test Store', getLatest: jest.fn() };
mockSavedSite.getLatest.mockReturnValue(mockSavedSite);
const mockUserLatest = { sites: [] as string[], incrementalUpdate: jest.fn() };
const mockDiscoverWpApiUrl = jest.fn(async () => 'https://example.com/wp-json/');
const mockDiscoverApiEndpoints = jest.fn(async () => ({
	endpoints: { wcpos_api_url: 'https://example.com/wp-json/wcpos/v2/' },
	siteData: { wcpos_version: '1.10.3' },
}));

jest.mock('../../../contexts/app-state', () => ({
	useAppState: () => ({
		user: {
			getLatest: () => mockUserLatest,
		},
		userDB: {
			sites: {
				parseRestResponse: (data: unknown) => data,
				findOneFix: () => ({ exec: jest.fn(async () => null) }),
			},
		},
	}),
}));
jest.mock('../../../contexts/app-state/hydration-steps', () => ({
	testAuthorizationMethod: (...args: unknown[]) => mockTestAuthorizationMethod(...args),
	runConnectCompatibilityProbes: (...args: unknown[]) => mockRunConnectCompatibilityProbes(...args),
}));
jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
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

// eslint-disable-next-line import/first -- Jest mocks must be registered before importing the hook.
import { useSiteConnect } from './use-site-connect';

describe('useSiteConnect', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockRunConnectCompatibilityProbes.mockResolvedValue({ blocking: null, warnings: [] });
	});

	it.each([
		// Inline copy is TRANSLATED (the t mock returns the key); dedicated keys
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

		expect(result.current.error).toBe(messageKey);
		expect(result.current.errorCode).toBe(code);

		act(() => result.current.reset());
		expect(result.current.error).toBeNull();
		expect(result.current.errorCode).toBeNull();
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

		expect(result.current.error).toBe('auth.host_compatibility_problem');
		expect(result.current.errorCode).toBe(ERROR_CODES.CACHE_SHARED_REPLAY);
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
