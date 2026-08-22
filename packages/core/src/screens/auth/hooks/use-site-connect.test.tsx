/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

const mockTestAuthorizationMethod = jest.fn();
const mockDiscoverWpApiUrl = jest.fn(async () => 'https://example.com/wp-json/');
const mockDiscoverApiEndpoints = jest.fn(async () => ({
	endpoints: { wcpos_api_url: 'https://example.com/wp-json/wcpos/v2/' },
	siteData: { wcpos_version: '1.10.0' },
}));

jest.mock('../../../contexts/app-state', () => ({
	useAppState: () => ({
		user: {},
		userDB: { sites: {} },
	}),
}));
jest.mock('../../../contexts/app-state/hydration-steps', () => ({
	testAuthorizationMethod: (...args: unknown[]) => mockTestAuthorizationMethod(...args),
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

// eslint-disable-next-line import/first -- Jest mocks must be registered before importing the hook.
import { useSiteConnect } from './use-site-connect';

describe('useSiteConnect', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it.each([
		// The inline message is TRANSLATED (the t mock returns the key); the
		// registry summary stays the docs/logs voice.
		[
			'credential-channels',
			ERROR_CODES.AUTH_TOKEN_BLOCKED_BY_HOST,
			'auth.server_blocks_login_token',
		],
		['transports', ERROR_CODES.REST_TRANSPORT_BLOCKED, 'auth.store_rest_api_unreachable'],
	] as const)('exposes and resets the %s coded connect error', async (blocked, code, summary) => {
		mockTestAuthorizationMethod.mockResolvedValue({ ok: false, blocked });
		const { result } = renderHook(() => useSiteConnect());

		await act(async () => {
			await result.current.onConnect('https://example.com');
		});

		expect(result.current.error).toBe(summary);
		expect(result.current.errorCode).toBe(code);

		act(() => result.current.reset());
		expect(result.current.error).toBeNull();
		expect(result.current.errorCode).toBeNull();
	});
});
