/**
 * @jest-environment jsdom
 */
import { renderHook, waitFor } from '@testing-library/react';

import { useUserValidation } from './use-user-validation';

const mockGet = jest.fn();
const mockIncrementalPatch = jest.fn(async () => undefined);
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
	it('clears stale capabilities when a successful cashier response omits them', async () => {
		mockGet.mockResolvedValue({ status: 200, data: { id: 7 } });
		const site = {
			uuid: 'site-1',
			url: 'https://example.com',
			wcpos_api_url: 'https://example.com/wp-json/wcpos/v2/',
			use_jwt_as_param: false,
		};
		const wpUser = {
			uuid: 'cashier-1',
			id$: { value: 7 },
			access_token$: { value: 'access-token' },
			refresh_token$: { value: 'refresh-token' },
			incrementalPatch: mockIncrementalPatch,
			getLatest: () => ({ stores: [] }),
		};

		renderHook(() => useUserValidation({ site: site as never, wpUser: wpUser as never }));

		await waitFor(() =>
			expect(mockIncrementalPatch).toHaveBeenCalledWith({ capabilities: undefined })
		);
	});
});
