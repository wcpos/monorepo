/**
 * @jest-environment jsdom
 */
import 'whatwg-fetch';

import { act, renderHook, waitFor } from '@testing-library/react';

import { useUserValidation } from './use-user-validation';

const { useHttpClient: useSharedHttpClient } = jest.requireActual<
	typeof import('@wcpos/hooks/use-http-client/use-http-client')
>('@wcpos/hooks/use-http-client/use-http-client');
const { http: sharedHttp } = jest.requireMock('@wcpos/hooks/use-http-client/http') as {
	http: { request: jest.Mock };
};

jest.mock('@wcpos/hooks/use-http-client/http', () => ({
	http: { request: jest.fn(), isCancel: () => false },
}));
jest.mock('@wcpos/hooks/use-http-client/request-queue', () => ({
	isDroppedRequestError: () => false,
	scheduleRequest: (request: () => Promise<unknown>) => request(),
}));
jest.mock('@wcpos/hooks/use-http-client/request-state-manager', () => ({
	requestStateManager: {
		checkCanProceed: () => ({ ok: true }),
		isTokenRefreshing: () => false,
	},
}));

const mockGet = jest.fn();
const mockIncrementalPatch = jest.fn(async () => undefined);
const mockIncrementalModify = jest.fn(async (_modify?: unknown) => undefined);
const mockBaseHttpClient = {};
const mockAuthenticatedHttpClient = { get: mockGet };
const mockRefreshHandler = jest.fn();
const mockWakeCallbacks: (() => void)[] = [];
// The update-required handler the hook hands its authenticated client.
let mockOnUpdateRequired: ((details: never) => void) | undefined;
const mockReportUpdateRequired = jest.fn();

jest.mock('@wcpos/utils/update-required-gate', () => ({
	reportUpdateRequired: (...args: unknown[]) => mockReportUpdateRequired(...args),
}));

const mockLogError = jest.fn();
const mockLogWarn = jest.fn();
jest.mock('@wcpos/utils/logger', () => ({
	...jest.requireActual('@wcpos/utils/logger'),
	getDatabaseEpoch: () => 0,
	// The shared logger mock has no redactor; the preview test needs the real one.
	redactSensitiveText: jest.requireActual('../../../utils/src/logger/redact').redactSensitiveText,
	// Delegate lazily: the hook calls getLogger at module scope, before the spies exist.
	getLogger: () => ({
		error: (...args: unknown[]) => mockLogError(...args),
		warn: (...args: unknown[]) => mockLogWarn(...args),
		debug: () => undefined,
		info: () => undefined,
	}),
}));

jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
}));

jest.mock('observable-hooks', () => ({
	useObservableEagerState: (observable: { value: unknown }) => observable.value,
}));
jest.mock('@wcpos/hooks/use-http-client', () => ({
	createTokenRefreshHandler: () => mockRefreshHandler,
	useHttpClient: (handlers?: unknown[], onUpdateRequired?: (details: never) => void) => {
		if (!handlers) return mockBaseHttpClient;
		mockOnUpdateRequired = onUpdateRequired;
		return mockAuthenticatedHttpClient;
	},
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
jest.mock('../../../query/src/user-db/stores', () => ({ mergeStoresWithResponse: jest.fn() }));
jest.mock('@wcpos/query/user-db', () =>
	jest.requireActual('../../../query/src/user-db/credentials')
);

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

	it('passes a canonical cashier path and metadata from a query-shaped base', async () => {
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
		expect(mockGet.mock.calls[0]?.[0]).toBe('https://example.com/wp-json/wcpos/v2/cashier/7');
		expect(mockGet.mock.calls[0]?.[1]).toMatchObject({
			wcposPreamble: {
				purpose: 'cashier',
				site: { wp_api_url: querySite.wp_api_url, use_rest_route_param: true },
			},
		});
	});

	it('dispatches the cashier query URL through the real shared wrapper', async () => {
		sharedHttp.request.mockResolvedValueOnce({
			status: 200,
			data: { id: 7, display_name: 'Demo Cashier' },
		});
		const { result: shared } = renderHook(() => useSharedHttpClient());
		mockGet.mockImplementation((url, config) => shared.current.get(url, config));
		const querySite = {
			...site,
			wp_api_url: 'https://example.com/?rest_route=/',
			use_rest_route_param: true,
		};
		const wpUser = makeWpUser({ stores: [] });

		const { result } = renderHook(() =>
			useUserValidation({ site: querySite as never, wpUser: wpUser as never })
		);

		await waitFor(() => expect(result.current.isLoading).toBe(false));
		expect(result.current.isValid).toBe(true);
		const sent = sharedHttp.request.mock.calls.at(-1)?.[0];
		expect(sent.url).toMatch(/^https:\/\/example\.com\/\?rest_route=%2Fwcpos%2Fv2%2Fcashier%2F7&/);
		expect(new URL(sent.url).searchParams.get('wcpos')).toBe('1');
		expect(sent).not.toHaveProperty('wcposPreamble');
	});

	it('passes the canonical cashier path and enabled query transport metadata', async () => {
		mockGet.mockResolvedValue({ status: 200, data: { id: 7, display_name: 'Demo Cashier' } });
		const wpUser = makeWpUser({ stores: [] });
		const querySite = {
			...site,
			wp_api_url: 'https://example.com/?rest_route=/',
			use_rest_route_param: true,
		};

		renderHook(() => useUserValidation({ site: querySite as never, wpUser: wpUser as never }));

		await waitFor(() => expect(mockGet).toHaveBeenCalled());
		expect(mockGet.mock.calls[0]?.[0]).toBe('https://example.com/wp-json/wcpos/v2/cashier/7');
		expect(mockGet.mock.calls[0]?.[1]).toMatchObject({
			wcposPreamble: {
				purpose: 'cashier',
				accessToken: 'access-token',
				site: { wp_api_url: querySite.wp_api_url, use_rest_route_param: true },
			},
		});
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

describe('useUserValidation when the server refuses this app version', () => {
	const site = {
		uuid: 'site-1',
		url: 'https://example.com',
		wp_api_url: 'https://example.com/wp-json/',
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

	beforeEach(() => {
		mockGet.mockReset();
		mockReportUpdateRequired.mockClear();
		mockIncrementalPatch.mockClear();
		mockWakeCallbacks.length = 0;
		mockOnUpdateRequired = undefined;
	});

	it('reports the 426 refusal under the engine site key and stays invalid', async () => {
		// The cashier GET goes through the REAL shared wrapper, built with the
		// handler the hook passed — so the refusal is parsed exactly as in the app.
		sharedHttp.request.mockRejectedValueOnce(
			Object.assign(new Error('Request failed with status code 426'), {
				isAxiosError: true,
				response: {
					status: 426,
					data: {
						code: 'wcpos_update_required',
						message: 'Update the app',
						data: { status: 426, min_protocol: 3, server_protocol: 3, plugin_version: '2.0.0' },
					},
				},
			})
		);
		const { result: shared } = renderHook(() =>
			useSharedHttpClient(undefined, (details) => mockOnUpdateRequired?.(details as never))
		);
		mockGet.mockImplementation((url, config) => shared.current.get(url, config));
		const wpUser = makeWpUser();

		const { result } = renderHook(() =>
			useUserValidation({ site: site as never, wpUser: wpUser as never })
		);

		await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		expect(mockReportUpdateRequired).toHaveBeenCalledTimes(1);
		// wp_api_url — the key the engine and the in-app UpdateRequiredGate use.
		expect(mockReportUpdateRequired).toHaveBeenCalledWith(site.wp_api_url, {
			minProtocol: 3,
			serverProtocol: 3,
			pluginVersion: '2.0.0',
			status: 426,
		});
		expect(result.current.isValid).toBe(false);
		expect(mockIncrementalPatch).not.toHaveBeenCalled();
	});
});

describe('useUserValidation when the cashier body is text, not JSON (POS-2KN)', () => {
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

	type LogCall = [string, { code?: string; context?: Record<string, unknown> }?];
	const callsWithCode = (spy: jest.Mock, code: string) =>
		(spy.mock.calls as LogCall[]).filter(([, options]) => options?.code === code);

	/** Render the hook against a 200 whose body is `data`, and wait for validation to settle. */
	const validateWith = async (data: string, headers: Record<string, string> = {}) => {
		mockGet.mockResolvedValue({ status: 200, headers, data });
		const wpUser = makeWpUser();
		const { result } = renderHook(() =>
			useUserValidation({ site: site as never, wpUser: wpUser as never })
		);
		await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		return result;
	};

	/** The one AUTH999 row's context. */
	const auth999Context = () => {
		const rows = callsWithCode(mockLogError, 'AUTH999');
		expect(rows).toHaveLength(1);
		return rows[0][1]?.context ?? {};
	};

	beforeEach(() => {
		mockGet.mockReset();
		mockIncrementalPatch.mockClear();
		mockIncrementalModify.mockClear();
		mockLogError.mockClear();
		mockLogWarn.mockClear();
		mockWakeCallbacks.length = 0;
	});

	it('validates when a stray prefix precedes the cashier JSON', async () => {
		const result = await validateWith(
			'<br />\n<b>Notice</b>: something deprecated in plugin.php<br />\n{"id":7,"display_name":"Demo Cashier"}'
		);

		await waitFor(() => expect(mockIncrementalPatch).toHaveBeenCalled());
		expect(result.current.isValid).toBe(true);
		expect(callsWithCode(mockLogWarn, 'SYNC151')).toHaveLength(1);
		expect(callsWithCode(mockLogError, 'AUTH999')).toHaveLength(0);
	});

	it('still fails on an HTML page, with diagnostics, even though a JSON object in it parses', async () => {
		const result = await validateWith(
			'<!DOCTYPE html><html><head><script>var cfg = {"a":1};</script></head><body>Just a moment...</body></html>',
			{ 'content-type': 'text/html; charset=UTF-8' }
		);

		const context = auth999Context();
		expect(context).toMatchObject({
			dataType: 'string',
			contentType: 'text/html; charset=UTF-8',
		});
		expect(typeof context.bodyPreview).toBe('string');
		expect(context.bodyPreview as string).toMatch(/^<!DOCTYPE html>/);
		expect((context.bodyPreview as string).length).toBeLessThanOrEqual(120);
		expect(result.current.isValid).toBe(false);
		expect(mockIncrementalPatch).not.toHaveBeenCalled();
		expect(callsWithCode(mockLogWarn, 'SYNC151')).toHaveLength(0);
	});

	it('rejects recovered JSON that belongs to another user', async () => {
		const result = await validateWith('stray {"id":99,"display_name":"Other"}');

		expect(auth999Context()).toMatchObject({ dataType: 'string' });
		expect(callsWithCode(mockLogWarn, 'SYNC151')).toHaveLength(0);
		expect(result.current.isValid).toBe(false);
		expect(mockIncrementalPatch).not.toHaveBeenCalled();
	});

	it('fails on an empty body, with diagnostics', async () => {
		const result = await validateWith('');

		expect(auth999Context()).toMatchObject({ dataType: 'string', bodyPreview: '' });
		expect(result.current.isValid).toBe(false);
	});

	it('redacts credentials in the body preview', async () => {
		await validateWith('Authorization: Bearer sk_live_SECRET123 <html>no json</html>');

		const context = auth999Context();
		expect(typeof context.bodyPreview).toBe('string');
		expect(context.bodyPreview as string).not.toContain('SECRET123');
	});
});
