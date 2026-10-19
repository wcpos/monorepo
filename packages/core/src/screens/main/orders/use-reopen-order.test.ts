/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';

import type { EngineRecord } from '@wcpos/query';
import { applyLocalPatch } from '@wcpos/query/mutations';
import { log } from '@wcpos/utils/logger';

import { useReopenOrder } from './use-reopen-order';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@wcpos/query', () => ({ useQueryRuntime: () => ({}) }));
jest.mock('@wcpos/query/mutations', () => ({
	...jest.requireActual('@wcpos/query/mutations'),
	applyLocalPatch: jest.fn(),
}));
jest.mock('../../../contexts/app-state', () => ({
	useStoreSession: () => ({
		store: { id: 1 },
		wpCredentials: { id: 7 },
		site: { uuid: 'site-1' },
	}),
}));
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../../services/register/use-register', () => ({ useRegister: () => null }));
jest.mock('../hooks/use-storage-health', () => ({
	useStorageMoneyPathGuard: () => ({ blockIfDegraded: () => false }),
}));

const order = {
	uuid: 'order-1',
	payload: { id: 42, status: 'completed', meta_data: [] },
} as unknown as EngineRecord<'orders'>;

beforeEach(() => jest.clearAllMocks());

it('does not navigate when the local write resolves undefined', async () => {
	jest.mocked(applyLocalPatch).mockResolvedValueOnce(undefined as never);
	const { result } = renderHook(() => useReopenOrder(order));
	await act(async () => result.current());
	expect(mockPush).not.toHaveBeenCalled();
});

it('keeps the local mutation failure toast and does not navigate', async () => {
	jest.mocked(applyLocalPatch).mockRejectedValueOnce(new Error('write failed'));
	const { result } = renderHook(() => useReopenOrder(order));
	await act(async () => result.current());
	expect(log.error).toHaveBeenCalledWith(
		'Local mutation failed',
		expect.objectContaining({ showToast: true })
	);
	expect(mockPush).not.toHaveBeenCalled();
});

it('navigates to the order cart after a successful local write', async () => {
	jest.mocked(applyLocalPatch).mockResolvedValueOnce({ document: order } as never);
	const { result } = renderHook(() => useReopenOrder(order));
	await act(async () => result.current());
	expect(mockPush).toHaveBeenCalledWith({
		pathname: '/cart/[...orderId]',
		params: { orderId: ['order-1'] },
	});
});
