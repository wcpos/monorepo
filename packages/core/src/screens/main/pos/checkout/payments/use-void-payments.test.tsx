/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';

import type { EngineRecord } from '@wcpos/query';

import { useVoidPayments } from './use-void-payments';

const mockLocalPatch = jest.fn();

jest.mock('../../../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({ post: jest.fn() }),
}));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'offline' }),
}));
jest.mock('@wcpos/query', () => ({ useQueryRuntime: () => ({}) }));
jest.mock('../../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: mockLocalPatch }),
	patchEngineResident: jest.fn(),
}));

const order = {
	uuid: 'order-1',
	payload: {},
	getLatest: () => ({
		payload: {
			id: 42,
			meta_data: [
				{
					key: '_wcpos_payments',
					value: {
						schema: 1,
						payments: [{ id: 'payment-1', status: 'captured' }],
					},
				},
			],
		},
	}),
} as EngineRecord<'orders'>;

it('rejects an offline void when localPatch did not apply it', async () => {
	mockLocalPatch.mockResolvedValue(undefined);
	const { result } = renderHook(() => useVoidPayments());

	await act(async () => {
		await expect(result.current(order)).rejects.toThrow('offline_void_local_patch_failed');
	});
});
