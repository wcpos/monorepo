/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { REJECTED_QUEUE_STATUSES } from '@wcpos/query';
import type { settleStoreDeletedOrder, StoreDeletedOrderSettlement } from '@wcpos/query/mutations';

import { useStoreDeletedOrdersSettler } from './use-store-deleted-orders';

const mockRows = new BehaviorSubject<unknown[]>([]);
const mockObserve = jest.fn((..._args: unknown[]) => mockRows.asObservable());
const mockSettle = jest.fn<
	ReturnType<typeof settleStoreDeletedOrder>,
	Parameters<typeof settleStoreDeletedOrder>
>();
const mockWarn = jest.fn();
const mockError = jest.fn();
let mockScope: string | null = 'scope-1';
const mockEngine = { status: () => ({ activeScopeId: mockScope }) };
const mockRuntime = { engine: mockEngine };
const mockT = (key: string, args?: { number: unknown }) => (args ? `${key}:${args.number}` : key);
jest.mock('@wcpos/query', () => ({
	REJECTED_QUEUE_STATUSES: ['rejected'],
	observeQueueRows: (...args: unknown[]) => mockObserve(...args),
	useQueryRuntime: () => mockRuntime,
}));
jest.mock('@wcpos/query/mutations', () => ({
	settleStoreDeletedOrder: (...args: Parameters<typeof settleStoreDeletedOrder>) =>
		mockSettle(...args),
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
const recreated: StoreDeletedOrderSettlement = {
	kind: 'recreated',
	number: '33827',
	alreadyReborn: false,
};
const emit = async (rows = [row]) => {
	await act(async () => {
		mockRows.next(rows);
	});
};
beforeEach(() => {
	mockScope = 'scope-1';
	mockRows.next([]);
	jest.resetAllMocks();
	mockObserve.mockImplementation(() => mockRows.asObservable());
	mockSettle.mockResolvedValue(recreated);
});

it.each(['recreated', 'removed'] as const)(
	'toasts once for a %s order and does not rerun a handled row',
	async (kind) => {
		mockSettle.mockResolvedValue({ kind, number: '33827', alreadyReborn: false });
		const { unmount } = renderHook(() => useStoreDeletedOrdersSettler(1));
		expect(mockObserve).toHaveBeenCalledWith(mockEngine, {
			statuses: REJECTED_QUEUE_STATUSES,
			collectionName: 'orders',
		});
		await emit();
		expect(mockSettle).toHaveBeenCalledWith(mockRuntime, {
			recordId: 'a',
			mutationId: 'm1',
			abandoned: expect.any(Function),
		});
		expect(mockWarn).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				code: 'SYNC203',
				showToast: true,
				toast: {
					title: 'pos_checkout.order_deleted_on_store',
					text2: `pos_checkout.order_deleted_on_store_${kind}:33827`,
				},
				context: { orderId: 'a', orderNumber: '33827', mutationId: 'm1', outcome: kind },
			})
		);
		await emit();
		expect(mockSettle).toHaveBeenCalledTimes(1);
		expect(mockWarn).toHaveBeenCalledTimes(1);
		unmount();
		expect(mockRows.observed).toBe(false);
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
	expect(mockSettle).not.toHaveBeenCalled();
});

it.each<StoreDeletedOrderSettlement>([
	{ kind: 'absent' },
	{ kind: 'recreated', alreadyReborn: true },
])('silently handles $kind (alreadyReborn=$alreadyReborn)', async (outcome) => {
	mockSettle.mockResolvedValue(outcome);
	renderHook(() => useStoreDeletedOrdersSettler(1));
	await emit();
	await emit();
	expect(mockSettle).toHaveBeenCalledTimes(1);
	expect(mockWarn).not.toHaveBeenCalled();
});

it.each(['recreated', 'removed'] as const)(
	'uses a title-only toast for %s without a number',
	async (kind) => {
		mockSettle.mockResolvedValue({ kind, alreadyReborn: false });
		renderHook(() => useStoreDeletedOrdersSettler(1));
		await emit();
		expect(mockWarn.mock.calls[0][1].toast).toEqual({
			title: 'pos_checkout.order_deleted_on_store',
		});
	}
);

it('retries a thrown settle only on the next emission and shows a failure toast', async () => {
	mockSettle.mockRejectedValueOnce(new Error('storage failed'));
	renderHook(() => useStoreDeletedOrdersSettler(1));
	await emit();
	expect(mockSettle).toHaveBeenCalledTimes(1);
	expect(mockError).toHaveBeenCalledWith(
		expect.any(String),
		expect.objectContaining({
			code: 'SYNC201',
			showToast: true,
			toast: { title: 'pos_checkout.order_refused', text2: 'storage failed' },
			context: { orderId: 'a', mutationId: 'm1', error: 'storage failed' },
		})
	);
	expect(mockWarn).not.toHaveBeenCalled();
	await emit();
	expect(mockSettle).toHaveBeenCalledTimes(2);
	expect(mockWarn).toHaveBeenCalledTimes(1);
});

it('keeps one settle per record in flight and rescans the latest second row without another emission', async () => {
	let finish!: (outcome: StoreDeletedOrderSettlement) => void;
	mockSettle.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			})
	);
	renderHook(() => useStoreDeletedOrdersSettler(1));
	await emit([row, { ...row, mutationId: 'stale' }]);
	await emit([row, { ...row, mutationId: 'm2' }]);
	expect(mockSettle).toHaveBeenCalledTimes(1);
	mockSettle.mockResolvedValue({ kind: 'recreated', alreadyReborn: true });
	await act(async () => {
		finish(recreated);
	});
	expect(mockSettle.mock.calls.map(([, input]) => input.mutationId)).toEqual(['m1', 'm2']);
	expect(mockWarn).toHaveBeenCalledTimes(1);
});

it('abandons a settle when unmounted mid-flight without a toast', async () => {
	let finish!: (outcome: StoreDeletedOrderSettlement) => void;
	mockSettle.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			})
	);
	const { unmount } = renderHook(() => useStoreDeletedOrdersSettler(1));
	await emit();
	const { abandoned } = mockSettle.mock.calls[0][1];
	expect(abandoned()).toBe(false);
	unmount();
	expect(abandoned()).toBe(true);
	await act(async () => {
		finish({ kind: 'abandoned' });
	});
	expect(mockSettle).toHaveBeenCalledTimes(1);
	expect(mockWarn).not.toHaveBeenCalled();
	expect(mockRows.observed).toBe(false);
});

it('abandons a moved scope and retries its row when back on its own scope', async () => {
	let finish!: (outcome: StoreDeletedOrderSettlement) => void;
	mockSettle.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			})
	);
	renderHook(() => useStoreDeletedOrdersSettler(1));
	await emit();
	const { abandoned } = mockSettle.mock.calls[0][1];
	expect(abandoned()).toBe(false);
	mockScope = 'scope-2';
	expect(abandoned()).toBe(true);
	await act(async () => {
		finish({ kind: 'abandoned' });
	});
	await emit();
	expect(mockSettle).toHaveBeenCalledTimes(1);
	expect(mockWarn).not.toHaveBeenCalled();
	mockScope = 'scope-1';
	await emit();
	expect(mockSettle).toHaveBeenCalledTimes(2);
	expect(mockWarn).toHaveBeenCalledTimes(1);
});

it('binds its scope lazily when mounted before the database opened', async () => {
	mockScope = null;
	renderHook(() => useStoreDeletedOrdersSettler(1));
	await emit();
	expect(mockSettle).not.toHaveBeenCalled();
	mockScope = 'scope-1';
	await emit();
	expect(mockSettle).toHaveBeenCalledTimes(1);
	expect(mockSettle.mock.calls[0][1].abandoned()).toBe(false);
});
