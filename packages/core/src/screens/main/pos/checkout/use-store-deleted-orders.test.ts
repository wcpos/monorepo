/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { REJECTED_QUEUE_STATUSES } from '@wcpos/query';

import { useStoreDeletedOrdersSettler } from './use-store-deleted-orders';

const mockRows = new BehaviorSubject<unknown[]>([]);
const mockObserve = jest.fn((..._args: unknown[]) => mockRows.asObservable());
const mockFind = jest.fn();
const mockRebirth = jest.fn();
const mockWarn = jest.fn();
const mockError = jest.fn();
const mockEngine = { resolveConflict: jest.fn(), write: jest.fn() };
const mockRuntime = { engine: mockEngine };
const mockT = (key: string, args?: { number: unknown }) => (args ? `${key}:${args.number}` : key);
jest.mock('@wcpos/query', () => ({
	REJECTED_QUEUE_STATUSES: ['rejected'],
	observeQueueRows: (...args: unknown[]) => mockObserve(...args),
	useQueryRuntime: () => mockRuntime,
}));
jest.mock('@wcpos/query/mutations', () => ({
	findEngineResident: (...args: unknown[]) => mockFind(...args),
	rebirthOrderResident: (...args: unknown[]) => mockRebirth(...args),
	residentPayload: (resident: { toMutableJSON(): { payload: unknown } }) =>
		resident.toMutableJSON().payload,
}));
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({
		warn: (...args: unknown[]) => mockWarn(...args),
		error: (...args: unknown[]) => mockError(...args),
	}),
	getErrorMessage: (error: Error) => error.message,
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => mockT }));
const row = {
	mutationId: 'm1',
	recordId: 'a',
	operation: 'update',
	rejectedStatus: 404,
	rejectedReason: 'woo_rxdb_sync_record_not_found',
};
const resident = (
	status: string,
	number: string | undefined = '33827',
	remoteId: string | null = '33827'
) => ({
	toJSON: () => ({ remoteId }),
	toMutableJSON: () => ({ payload: { id: 33827, status, number } }),
});
const emit = async (rows = [row]) => {
	await act(async () => {
		mockRows.next(rows);
	});
};
beforeEach(() => {
	mockRows.next([]);
	jest.resetAllMocks();
	mockObserve.mockImplementation(() => mockRows.asObservable());
	mockEngine.resolveConflict.mockResolvedValue(undefined);
	mockEngine.write.mockResolvedValue({ mutationId: 'create' });
	mockFind.mockResolvedValue(resident('pos-open'));
	mockRebirth.mockResolvedValue(resident('pos-open'));
});

it('rebirths an open cart, discards then writes a plain create and toasts once', async () => {
	const reborn = { toMutableJSON: () => ({ payload: { id: 0, status: 'pos-open' } }) };
	mockFind.mockResolvedValueOnce(resident('pos-open')).mockResolvedValue(reborn);
	mockRebirth.mockResolvedValue(reborn);
	const { unmount } = renderHook(() => useStoreDeletedOrdersSettler(1));
	expect(mockObserve).toHaveBeenCalledWith(mockEngine, {
		statuses: REJECTED_QUEUE_STATUSES,
		collectionName: 'orders',
	});
	await emit();
	expect(mockRebirth).toHaveBeenCalledWith(mockRuntime, 'a');
	expect(mockFind).toHaveBeenCalledTimes(1);
	expect(mockEngine.resolveConflict).toHaveBeenCalledWith('m1', 'discard');
	expect(mockEngine.write).toHaveBeenCalledWith({
		collection: 'orders',
		operation: 'create',
		recordId: 'a',
		payload: { id: 0, status: 'pos-open' },
	});
	expect(mockRebirth.mock.invocationCallOrder[0]).toBeLessThan(
		mockEngine.resolveConflict.mock.invocationCallOrder[0]
	);
	expect(mockEngine.resolveConflict.mock.invocationCallOrder[0]).toBeLessThan(
		mockEngine.write.mock.invocationCallOrder[0]
	);
	expect(mockWarn).toHaveBeenCalledWith(
		expect.any(String),
		expect.objectContaining({
			code: 'SYNC203',
			showToast: true,
			toast: {
				title: 'pos_checkout.order_deleted_on_store',
				text2: 'pos_checkout.order_deleted_on_store_recreated:33827',
			},
			context: { orderId: 'a', orderNumber: '33827', mutationId: 'm1', outcome: 'recreated' },
		})
	);
	await emit();
	expect(mockEngine.write).toHaveBeenCalledTimes(1);
	expect(mockWarn).toHaveBeenCalledTimes(1);
	unmount();
	expect(mockRows.observed).toBe(false);
});

it.each(['completed', 'pos-partial', 'pending', 'processing', 'custom'])(
	'discards %s without creating',
	async (status) => {
		mockFind.mockResolvedValue(resident(status));
		renderHook(() => useStoreDeletedOrdersSettler(1));
		await emit();
		expect(mockEngine.resolveConflict).toHaveBeenCalledWith('m1', 'discard');
		expect(mockRebirth).not.toHaveBeenCalled();
		expect(mockEngine.write).not.toHaveBeenCalled();
		expect(mockWarn).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				showToast: true,
				toast: {
					title: 'pos_checkout.order_deleted_on_store',
					text2: 'pos_checkout.order_deleted_on_store_removed:33827',
				},
				context: { orderId: 'a', orderNumber: '33827', mutationId: 'm1', outcome: 'removed' },
			})
		);
	}
);

it.each([
	{ rejectedReason: 'other' },
	{ rejectedStatus: 403 },
	{ operation: 'create' },
	{ operation: 'delete' },
])('ignores an unrelated rejection %o', async (overrides) => {
	renderHook(() => useStoreDeletedOrdersSettler(1));
	await emit([{ ...row, ...overrides }]);
	expect(mockFind).not.toHaveBeenCalled();
	expect(mockEngine.resolveConflict).not.toHaveBeenCalled();
});

it('discards an absent resident silently', async () => {
	mockFind.mockResolvedValue(null);
	renderHook(() => useStoreDeletedOrdersSettler(1));
	await emit();
	expect(mockEngine.resolveConflict).toHaveBeenCalledWith('m1', 'discard');
	expect(mockWarn).not.toHaveBeenCalled();
});

it('uses a title-only toast when the order number is absent', async () => {
	mockFind.mockResolvedValue({
		toJSON: () => ({ remoteId: '33827' }),
		toMutableJSON: () => ({ payload: { status: 'completed' } }),
	});
	renderHook(() => useStoreDeletedOrdersSettler(1));
	await emit();
	expect(mockWarn.mock.calls[0][1].toast).toEqual({ title: 'pos_checkout.order_deleted_on_store' });
});

it('retries a thrown settle only on the next emission and shows a failure toast', async () => {
	mockFind.mockRejectedValueOnce(new Error('storage failed'));
	renderHook(() => useStoreDeletedOrdersSettler(1));
	await emit();
	expect(mockFind).toHaveBeenCalledTimes(1);
	expect(mockError).toHaveBeenCalledWith(
		expect.any(String),
		expect.objectContaining({
			code: 'SYNC201',
			showToast: true,
			toast: { title: 'pos_checkout.order_refused', text2: 'storage failed' },
			context: expect.objectContaining({ error: 'storage failed' }),
		})
	);
	expect(mockWarn).not.toHaveBeenCalled();
	await emit();
	expect(mockEngine.resolveConflict).toHaveBeenCalledWith('m1', 'discard');
	expect(mockEngine.write).toHaveBeenCalledTimes(1);
});

it('drains the latest second row for a record after the first settles without another emission', async () => {
	let finish!: () => void;
	mockEngine.resolveConflict.mockImplementationOnce(
		() =>
			new Promise<void>((resolve) => {
				finish = resolve;
			})
	);
	renderHook(() => useStoreDeletedOrdersSettler(1));
	await emit([row, { ...row, mutationId: 'stale' }]);
	await emit([row, { ...row, mutationId: 'm2' }]);
	expect(mockFind).toHaveBeenCalledTimes(1);
	mockFind.mockResolvedValue(resident('pos-open', undefined, null));
	await act(async () => {
		finish();
	});
	expect(mockEngine.resolveConflict.mock.calls).toEqual([
		['m1', 'discard'],
		['m2', 'discard'],
	]);
	expect(mockEngine.write).toHaveBeenCalledTimes(2);
	expect(mockWarn).toHaveBeenCalledTimes(1);
});

it('discards and creates an already-reborn cart without another toast', async () => {
	mockFind.mockResolvedValue(resident('pos-open', undefined, null));
	renderHook(() => useStoreDeletedOrdersSettler(1));
	await emit();
	expect(mockEngine.resolveConflict).toHaveBeenCalledWith('m1', 'discard');
	expect(mockEngine.write).toHaveBeenCalledTimes(1);
	expect(mockWarn).not.toHaveBeenCalled();
});
