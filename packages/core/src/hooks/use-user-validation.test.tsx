/**
 * @jest-environment jsdom
 */
import { renderHook, waitFor } from '@testing-library/react';

import { useUserValidation } from './use-user-validation';

const mockGet = jest.fn();
const mockIncrementalPatch = jest.fn(async () => undefined);
const mockIncrementalModify = jest.fn(async (_modify?: unknown) => undefined);
const mockBaseHttpClient = {};
const mockAuthenticatedHttpClient = { get: mockGet };
const mockRefreshHandler = jest.fn();

jest.mock('observable-hooks', () => ({
	useObservableEagerState: (observable: { value: unknown }) => observable.value,
}));
jest.mock('@wcpos/hooks/use-http-client', () => ({
	createTokenRefreshHandler: () => mockRefreshHandler,
	useHttpClient: (handlers?: unknown[]) =>
		handlers ? mockAuthenticatedHttpClient : mockBaseHttpClient,
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
});
