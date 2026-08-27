/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';

import { useUserValidation } from './use-user-validation';

const mockGet = jest.fn();
const mockIncrementalPatch = jest.fn(async () => undefined);
const mockIncrementalModify = jest.fn(async (_modify?: unknown) => undefined);
const mockBaseHttpClient = {};
const mockAuthenticatedHttpClient = { get: mockGet };
const mockRefreshHandler = jest.fn();
const mockWakeCallbacks: (() => void)[] = [];

jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
}));

jest.mock('observable-hooks', () => ({
	useObservableEagerState: (observable: { value: unknown }) => observable.value,
}));
jest.mock('@wcpos/hooks/use-http-client', () => ({
	createTokenRefreshHandler: () => mockRefreshHandler,
	useHttpClient: (handlers?: unknown[]) =>
		handlers ? mockAuthenticatedHttpClient : mockBaseHttpClient,
	// The real predicate — a hand-written stub here would ratify the test instead
	// of checking the guard the hook actually uses.
	isAsleepBlock: jest.requireActual('@wcpos/hooks/use-http-client/request-state-manager')
		.isAsleepBlock,
	requestStateManager: {
		onWake: (callback: () => void) => {
			mockWakeCallbacks.push(callback);
			return () => {
				const index = mockWakeCallbacks.indexOf(callback);
				if (index !== -1) mockWakeCallbacks.splice(index, 1);
			};
		},
	},
}));
jest.mock('../contexts/app-state', () => ({
	useAppState: () => ({ userDB: {}, user: { uuid: 'user-1' } }),
}));
jest.mock('../utils/merge-stores', () => ({ mergeStoresWithResponse: jest.fn() }));

describe('useUserValidation capabilities', () => {
	const site = {
		uuid: 'site-1',
		url: 'https://example.com',
		wcpos_api_url: 'https://example.com/wp-json/wcpos/v2/',
		use_jwt_as_param: false,
	};

	const makeWpUser = (latest: Record<string, unknown>) => ({
		uuid: 'cashier-1',
		id$: { value: 7 },
		access_token$: { value: 'access-token' },
		refresh_token$: { value: 'refresh-token' },
		incrementalPatch: mockIncrementalPatch,
		getLatest: () => ({ ...latest, incrementalModify: mockIncrementalModify }),
	});

	beforeEach(() => {
		mockGet.mockReset();
		mockIncrementalPatch.mockClear();
		mockIncrementalModify.mockClear();
		mockWakeCallbacks.length = 0;
	});

	it('never patches capabilities: undefined when the cashier response omits them', async () => {
		// Regression: a `capabilities: undefined` patch fails RxDB schema
		// validation (422) against servers without the capability payload,
		// which failed the whole login validation (Re-authenticate + no stores).
		mockGet.mockResolvedValue({ status: 200, data: { id: 7, display_name: 'Demo Cashier' } });
		const wpUser = makeWpUser({ stores: [] });

		renderHook(() => useUserValidation({ site: site as never, wpUser: wpUser as never }));

		await waitFor(() => expect(mockIncrementalPatch).toHaveBeenCalled());
		for (const [patch] of mockIncrementalPatch.mock.calls as unknown as [
			Record<string, unknown>,
		][]) {
			expect(Object.keys(patch)).not.toContain('capabilities');
		}
		// No stale caps stored locally — nothing to clear.
		expect(mockIncrementalModify).not.toHaveBeenCalled();
	});

	it('clears stale stored capabilities via incrementalModify when the response omits them', async () => {
		mockGet.mockResolvedValue({ status: 200, data: { id: 7, display_name: 'Demo Cashier' } });
		const wpUser = makeWpUser({ stores: [], capabilities: ['edit_products'] });

		renderHook(() => useUserValidation({ site: site as never, wpUser: wpUser as never }));

		await waitFor(() => expect(mockIncrementalModify).toHaveBeenCalledTimes(1));
		const modifyFn = mockIncrementalModify.mock.calls[0][0] as unknown as (
			doc: Record<string, unknown>
		) => Record<string, unknown>;
		const result = modifyFn({ uuid: 'cashier-1', capabilities: ['edit_products'] });
		expect(Object.keys(result)).not.toContain('capabilities');
	});

	it('patches sanitized capabilities when the response provides them', async () => {
		mockGet.mockResolvedValue({
			status: 200,
			data: { id: 7, capabilities: ['edit_products', '', 'edit_products', 'publish_products'] },
		});
		const wpUser = makeWpUser({ stores: [] });

		renderHook(() => useUserValidation({ site: site as never, wpUser: wpUser as never }));

		await waitFor(() =>
			expect(mockIncrementalPatch).toHaveBeenCalledWith(
				expect.objectContaining({ capabilities: ['edit_products', 'publish_products'] })
			)
		);
		expect(mockIncrementalModify).not.toHaveBeenCalled();
	});

	it('joins the cashier route from a query-shaped base without a trailing slash', async () => {
		mockGet.mockResolvedValue({ status: 200, data: { id: 7, display_name: 'Demo Cashier' } });
		const wpUser = makeWpUser({ stores: [] });
		const querySite = {
			...site,
			wp_api_url: 'https://example.com/?rest_route=/',
			wcpos_api_url: 'https://example.com/?rest_route=/wcpos/v2',
			use_rest_route_param: true,
		};

		renderHook(() => useUserValidation({ site: querySite as never, wpUser: wpUser as never }));

		await waitFor(() => expect(mockGet).toHaveBeenCalled());
		expect(mockGet.mock.calls[0]?.[0]).toBe('https://example.com/?rest_route=/wcpos/v2/cashier/7');
	});

	it('validates the cashier through query transport when enabled', async () => {
		mockGet.mockResolvedValue({ status: 200, data: { id: 7, display_name: 'Demo Cashier' } });
		const wpUser = makeWpUser({ stores: [] });
		const querySite = {
			...site,
			wp_api_url: 'https://example.com/?rest_route=/',
			use_rest_route_param: true,
		};

		renderHook(() => useUserValidation({ site: querySite as never, wpUser: wpUser as never }));

		await waitFor(() => expect(mockGet).toHaveBeenCalled());
		expect(mockGet.mock.calls[0]?.[0]).toBe('https://example.com/?rest_route=/wcpos/v2/cashier/7');
		expect(mockGet.mock.calls[0]?.[1]).toMatchObject({
			params: { wcpos: 1, wcpos_protocol: 2, wcpos_client: 'web/0.0.0' },
		});
		expect(mockGet.mock.calls[0]?.[1].headers).not.toHaveProperty('X-WCPOS-Protocol');
		expect(mockGet.mock.calls[0]?.[1].headers).not.toHaveProperty('X-WCPOS-Client');
	});
});

describe('useUserValidation while the app is asleep', () => {
	const site = {
		uuid: 'site-1',
		url: 'https://example.com',
		wcpos_api_url: 'https://example.com/wp-json/wcpos/v2/',
		use_jwt_as_param: false,
	};

	const makeWpUser = () => ({
		uuid: 'cashier-1',
		id$: { value: 7 },
		access_token$: { value: 'access-token' },
		refresh_token$: { value: 'refresh-token' },
		incrementalPatch: mockIncrementalPatch,
		getLatest: () => ({ stores: [], incrementalModify: mockIncrementalModify }),
	});

	const makeAsleepError = () =>
		Object.assign(new Error('App is in background'), {
			isPreFlightBlocked: true,
			blockCode: 'preflight-asleep',
			isSleeping: true,
		});

	beforeEach(() => {
		mockGet.mockReset();
		mockIncrementalPatch.mockClear();
		mockIncrementalModify.mockClear();
		mockWakeCallbacks.length = 0;
	});

	it('defers instead of failing when the request is blocked by the asleep pre-flight check', async () => {
		// Regression: a hidden-tab token refresh re-triggered validation, whose
		// request was blocked by the sleeping pre-flight check — and the expected
		// block was logged as AUTH999 errors and flipped isValid to false.
		mockGet.mockRejectedValue(makeAsleepError());
		const wpUser = makeWpUser();

		const { result } = renderHook(() =>
			useUserValidation({ site: site as never, wpUser: wpUser as never })
		);

		await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		expect(result.current.isValid).toBe(true);
		expect(result.current.error).toBeNull();
	});

	it('retries the deferred validation when the app wakes', async () => {
		mockGet
			.mockRejectedValueOnce(makeAsleepError())
			.mockResolvedValue({ status: 200, data: { id: 7, display_name: 'Demo Cashier' } });
		const wpUser = makeWpUser();

		const { result } = renderHook(() =>
			useUserValidation({ site: site as never, wpUser: wpUser as never })
		);

		await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(result.current.isLoading).toBe(false));

		act(() => {
			mockWakeCallbacks.forEach((callback) => callback());
		});

		await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
		await waitFor(() => expect(mockIncrementalPatch).toHaveBeenCalled());
		expect(result.current.isValid).toBe(true);
	});

	it('does not re-validate on wake when the last validation succeeded', async () => {
		mockGet.mockResolvedValue({ status: 200, data: { id: 7, display_name: 'Demo Cashier' } });
		const wpUser = makeWpUser();

		const { result } = renderHook(() =>
			useUserValidation({ site: site as never, wpUser: wpUser as never })
		);

		await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(result.current.isLoading).toBe(false));

		act(() => {
			mockWakeCallbacks.forEach((callback) => callback());
		});

		// The validation-key guard skips the re-run — nothing was deferred.
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		expect(mockGet).toHaveBeenCalledTimes(1);
	});
});
