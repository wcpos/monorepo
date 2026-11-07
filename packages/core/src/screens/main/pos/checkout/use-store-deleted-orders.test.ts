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
	rebirthEngineResident: (...args: unknown[]) => mockRebirth(...args),
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
const resident = (status: string, number: string | undefined = '33827') => ({
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
	expect(mockRebirth).toHaveBeenCalledWith({
		manager: mockRuntime,
		collection: 'orders',
		recordId: 'a',
	});
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
				description: 'pos_checkout.order_deleted_on_store_recreated:33827',
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
					description: 'pos_checkout.order_deleted_on_store_removed:33827',
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
	mockFind.mockResolvedValue({ toMutableJSON: () => ({ payload: { status: 'completed' } }) });
	renderHook(() => useStoreDeletedOrdersSettler(1));
	await emit();
	expect(mockWarn.mock.calls[0][1].toast).toEqual({ title: 'pos_checkout.order_deleted_on_store' });
});

it('does not retry a failed mutation or settle another row of that record in flight', async () => {
	let reject!: (error: Error) => void;
	mockFind.mockReturnValue(
		new Promise((_resolve, no) => {
			reject = no;
		})
	);
	renderHook(() => useStoreDeletedOrdersSettler(1));
	await emit([row, { ...row, mutationId: 'm2' }]);
	await emit();
	expect(mockFind).toHaveBeenCalledTimes(1);
	await act(async () => {
		reject(new Error('storage failed'));
	});
	await emit();
	expect(mockFind).toHaveBeenCalledTimes(1);
	expect(mockError).toHaveBeenCalledWith(
		expect.any(String),
		expect.objectContaining({
			code: 'SYNC201',
			context: expect.objectContaining({ error: 'storage failed' }),
		})
	);
	expect(mockWarn).not.toHaveBeenCalled();
	expect(mockEngine.resolveConflict).not.toHaveBeenCalled();
});
