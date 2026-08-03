/**
 * @jest-environment jsdom
 */
import { serialize } from 'node:v8';

import { act, renderHook } from '@testing-library/react';

import { useAddItemToOrder } from './use-add-item-to-order';

const mockLocalPatch = jest.fn();
const mockSetCurrentOrderID = jest.fn();
const mockInsertEngineResident = jest.fn();
const mockFindEngineResident = jest.fn();
const mockPatchEngineResident = jest.fn();
const mockWrite = jest.fn();
const mockCheckCartStock = jest.fn();
const mockWrapEngineDocument = jest.fn();
const mockCalculateLineItemTaxesAndTotals = jest.fn();
let mockStockGuardEnabled = false;

/** The state a resident carries once its create is durably enqueued. */
const CREATE_QUEUED = { local: { dirty: true, pendingMutationIds: ['mutation-1'] } };

jest.mock('./use-cart-stock-guard', () => ({
	useCartStockGuard: () => ({
		stockGuardEnabled: mockStockGuardEnabled,
		checkCartStock: mockCheckCartStock,
		showBackorderWarning: jest.fn(),
	}),
}));

jest.mock('./use-calculate-line-item-tax-and-totals', () => ({
	useCalculateLineItemTaxAndTotals: () => ({
		calculateLineItemTaxesAndTotals: (...args: unknown[]) =>
			mockCalculateLineItemTaxesAndTotals(...args),
	}),
}));

const order: Record<string, unknown> & {
	getLatest(): typeof order;
	line_items: Record<string, unknown>[];
} = {
	uuid: 'order-uuid',
	id: 42,
	line_items: [],
	getLatest: () => order,
	toJSON: () => ({ uuid: 'order-uuid' }),
	toMutableJSON: () => ({ uuid: 'order-uuid' }),
	remove: async () => undefined,
};

jest.mock('@wcpos/query', () => ({
	useQueryManager: () => ({ engine: { write: mockWrite } }),
}));

jest.mock('@wcpos/query/engine-compat', () => ({
	wrapEngineDocument: (...args: unknown[]) => mockWrapEngineDocument(...args),
}));

jest.mock('uuid', () => ({
	v4: () => 'line-item-uuid',
}));

jest.mock('../../../../hooks/use-local-date', () => ({
	convertLocalDateToUTCString: () => '2026-07-14T00:00:00',
}));

jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	documentRecordId: (document: { uuid?: string }) => document.uuid ?? null,
	findEngineResident: (...args: unknown[]) => mockFindEngineResident(...args),
	insertEngineResident: (...args: unknown[]) => mockInsertEngineResident(...args),
	patchEngineResident: (...args: unknown[]) => mockPatchEngineResident(...args),
	useLocalMutation: () => ({ localPatch: mockLocalPatch }),
}));

jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({
		currentOrder: { getLatest: () => order },
		setCurrentOrderID: mockSetCurrentOrderID,
	}),
}));

describe('useAddItemToOrder', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockStockGuardEnabled = false;
		mockFindEngineResident.mockResolvedValue(null);
		mockWrapEngineDocument.mockImplementation((_collection, resident) => resident);
		// Stands in for the real tax/totals recalculation: enough to prove the merged
		// line is put back through it instead of keeping the pre-merge totals.
		mockCalculateLineItemTaxesAndTotals.mockImplementation(
			(lineItem: { price?: number; quantity?: number }) => ({
				...lineItem,
				total: String((lineItem.price ?? 0) * (lineItem.quantity ?? 0)),
			})
		);
		mockCheckCartStock.mockResolvedValue({
			allowed: true,
			warning: null,
			available: 10,
			name: '',
		});
		order.line_items = [];
		order.isNew = false;
		order.toJSON = () => ({ uuid: 'order-uuid' });
		order.toMutableJSON = () => ({ uuid: 'order-uuid' });
	});

	it('creates an engine order from a worker-cloneable temporary-order snapshot', async () => {
		const nestedProxy = new Proxy({ first_name: 'Guest' }, {});
		const residentPayloadProxy = new Proxy({ status: 'pos-open' }, {});
		order.isNew = true;
		order.toJSON = () => ({ uuid: 'order-uuid', billing: nestedProxy });
		order.toMutableJSON = () => ({
			uuid: 'order-uuid',
			billing: { first_name: 'Guest' },
		});
		mockInsertEngineResident.mockImplementation(
			async ({ payload }: { payload: Record<string, unknown> }) => {
				serialize(payload);
				return {
					get: () => residentPayloadProxy,
					toMutableJSON: () => ({ payload: { status: 'pos-open' } }),
				};
			}
		);
		mockWrite.mockImplementation(async ({ payload }: { payload: Record<string, unknown> }) => {
			serialize(payload);
			return { mutationId: 'mutation-1' };
		});

		const { result } = renderHook(() => useAddItemToOrder());
		await act(async () => {
			await result.current.addItemToOrder('line_items', {
				product_id: 1,
				meta_data: [],
			} as never);
		});

		expect(mockSetCurrentOrderID).toHaveBeenCalledWith('order-uuid');
		expect(mockCheckCartStock).not.toHaveBeenCalled();
	});

	it('keeps both items when two appends overlap for the same order', async () => {
		let releaseFirst!: () => void;
		const firstPatchMayFinish = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		let calls = 0;
		mockLocalPatch.mockImplementation(
			async ({ data }: { data: { line_items: Record<string, unknown>[] } }) => {
				calls += 1;
				if (calls === 1) await firstPatchMayFinish;
				order.line_items = data.line_items;
				return { changes: data, document: order };
			}
		);

		const { result } = renderHook(() => useAddItemToOrder());
		const first = { product_id: 1, meta_data: [] };
		const second = { product_id: 2, meta_data: [] };

		let firstAppend!: Promise<unknown>;
		let secondAppend!: Promise<unknown>;
		act(() => {
			firstAppend = result.current.addItemToOrder('line_items', first as never);
			secondAppend = result.current.addItemToOrder('line_items', second as never);
		});

		await Promise.resolve();
		expect(mockLocalPatch).toHaveBeenCalledTimes(1);
		releaseFirst();
		await act(async () => Promise.all([firstAppend, secondAppend]));

		expect(order.line_items.map((item) => item.product_id)).toEqual([1, 2]);
	});

	it('serializes overlapping additions while a new order is being saved', async () => {
		order.isNew = true;
		mockStockGuardEnabled = true;
		mockCheckCartStock.mockImplementation(
			async ({ lineItems }: { lineItems: Record<string, unknown>[] }) => ({
				allowed: lineItems.length === 0,
				warning: null,
				available: 1,
				name: 'Item',
			})
		);
		mockInsertEngineResident.mockImplementation(
			async ({ payload }: { payload: Record<string, unknown> }) => ({
				payload,
				toMutableJSON: () => ({ payload }),
			})
		);
		mockWrapEngineDocument.mockImplementation((_collection, resident: { payload: object }) => {
			const savedOrder = {
				...resident.payload,
				getLatest: () => savedOrder,
			};
			return savedOrder;
		});
		mockWrite.mockResolvedValue({ mutationId: 'mutation-1' });

		const { result: firstHook } = renderHook(() => useAddItemToOrder());
		const { result: secondHook } = renderHook(() => useAddItemToOrder());
		await act(async () => {
			await Promise.all([
				firstHook.current.addItemToOrder('line_items', {
					product_id: 1,
					quantity: 1,
					meta_data: [],
				} as never),
				secondHook.current.addItemToOrder('line_items', {
					product_id: 1,
					quantity: 1,
					meta_data: [],
				} as never),
			]);
		});

		expect(mockCheckCartStock.mock.calls.map(([args]) => args.lineItems.length)).toEqual([0, 1]);
		expect(mockInsertEngineResident).toHaveBeenCalledTimes(1);
		expect(mockWrite).toHaveBeenCalledTimes(1);
	});

	it('reuses an existing engine order when the current order is a stale temporary order', async () => {
		order.isNew = true;
		const resident = {
			...CREATE_QUEUED,
			payload: { uuid: 'order-uuid', line_items: [{ product_id: 1 }] },
			toMutableJSON: () => ({
				payload: { uuid: 'order-uuid', line_items: [{ product_id: 1 }] },
			}),
		};
		const savedOrder = {
			...resident.payload,
			getLatest: () => savedOrder,
		};
		mockInsertEngineResident.mockResolvedValue(resident);
		mockWrapEngineDocument.mockReturnValue(savedOrder);
		mockWrite.mockResolvedValue({ mutationId: 'mutation-1' });
		mockLocalPatch.mockResolvedValue({ document: savedOrder });

		const { result } = renderHook(() => useAddItemToOrder());
		await act(async () => {
			await result.current.addItemToOrder('line_items', {
				product_id: 1,
				meta_data: [],
			} as never);
		});
		mockFindEngineResident.mockResolvedValue(resident);
		await act(async () => {
			await result.current.addItemToOrder('line_items', {
				product_id: 2,
				meta_data: [],
			} as never);
		});

		expect(mockInsertEngineResident).toHaveBeenCalledTimes(1);
		expect(mockWrite).toHaveBeenCalledTimes(1);
		expect(mockWrite).toHaveBeenCalledWith(expect.objectContaining({ operation: 'create' }));
		expect(mockLocalPatch).toHaveBeenCalledTimes(1);
		expect(mockLocalPatch).toHaveBeenCalledWith({
			document: savedOrder,
			data: { line_items: [{ product_id: 1 }, expect.objectContaining({ product_id: 2 })] },
		});
	});

	it('reuses an acked order that carries a server id but no revision', async () => {
		order.isNew = true;
		// What a created order looks like once wc/v3 acks it: the queue row is gone
		// (not dirty, nothing pending) and the ack stamped `wooOrderId`. Woo answers
		// with a bare order, so `sync.revision` NEVER moves off '' — reading the
		// revision alone would call this an orphan and create the order twice.
		const ackedPayload = { uuid: 'order-uuid', id: 4711, line_items: [{ product_id: 1 }] };
		const resident = {
			local: { dirty: false, pendingMutationIds: [] },
			sync: { revision: '', source: 'skeleton' },
			wooOrderId: 4711,
			payload: ackedPayload,
			toMutableJSON: () => ({ payload: ackedPayload }),
			remove: jest.fn().mockResolvedValue(undefined),
		};
		const savedOrder = { ...ackedPayload, getLatest: () => savedOrder };
		mockFindEngineResident.mockResolvedValue(resident);
		mockWrapEngineDocument.mockReturnValue(savedOrder);
		mockLocalPatch.mockResolvedValue({ document: savedOrder });

		const { result } = renderHook(() => useAddItemToOrder());
		await act(async () => {
			await result.current.addItemToOrder('line_items', {
				product_id: 2,
				meta_data: [],
			} as never);
		});

		expect(mockInsertEngineResident).not.toHaveBeenCalled();
		expect(mockPatchEngineResident).not.toHaveBeenCalled();
		expect(mockWrite).not.toHaveBeenCalled();
		expect(resident.remove).not.toHaveBeenCalled();
		expect(mockLocalPatch).toHaveBeenCalledTimes(1);
	});

	it('checks stock against the recovered engine order, not the stale temporary order', async () => {
		order.isNew = true;
		mockStockGuardEnabled = true;
		const resident = {
			...CREATE_QUEUED,
			payload: { uuid: 'order-uuid', line_items: [{ product_id: 1, quantity: 1 }] },
			toMutableJSON: () => ({
				payload: { uuid: 'order-uuid', line_items: [{ product_id: 1, quantity: 1 }] },
			}),
		};
		const savedOrder = {
			...resident.payload,
			getLatest: () => savedOrder,
		};
		mockInsertEngineResident.mockResolvedValue(resident);
		mockWrapEngineDocument.mockReturnValue(savedOrder);
		mockWrite.mockResolvedValue({ mutationId: 'mutation-1' });
		mockLocalPatch.mockResolvedValue({ document: savedOrder });
		// Only one unit in stock: the cart is allowed to go from empty to one item.
		mockCheckCartStock.mockImplementation(
			async ({ lineItems }: { lineItems: Record<string, unknown>[] }) => ({
				allowed: lineItems.length === 0,
				warning: null,
				available: 1,
				name: 'Item',
			})
		);

		const { result } = renderHook(() => useAddItemToOrder());
		await act(async () => {
			await result.current.addItemToOrder('line_items', {
				product_id: 1,
				quantity: 1,
				meta_data: [],
			} as never);
		});

		// The scanner still holds the temporary order, but the engine order now exists.
		mockFindEngineResident.mockResolvedValue(resident);
		let secondAdd: unknown;
		await act(async () => {
			secondAdd = await result.current.addItemToOrder('line_items', {
				product_id: 1,
				quantity: 1,
				meta_data: [],
			} as never);
		});

		// The second check must see the resident's line item, otherwise the stale empty
		// temporary order would let an out-of-stock repeat scan through.
		expect(mockCheckCartStock.mock.calls.map(([args]) => args.lineItems.length)).toEqual([0, 1]);
		expect(secondAdd).toBe(false);
		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(mockInsertEngineResident).toHaveBeenCalledTimes(1);
		expect(mockWrite).toHaveBeenCalledTimes(1);
	});

	it('merges a repeat scan into the resident line instead of splitting it', async () => {
		order.isNew = true;
		const residentLine = {
			product_id: 1,
			quantity: 1,
			price: 5,
			meta_data: [{ key: '_woocommerce_pos_uuid', value: 'line-1' }],
		};
		const resident = {
			...CREATE_QUEUED,
			payload: { uuid: 'order-uuid', line_items: [residentLine] },
			toMutableJSON: () => ({ payload: { uuid: 'order-uuid', line_items: [residentLine] } }),
		};
		const savedOrder = { ...resident.payload, getLatest: () => savedOrder };
		mockFindEngineResident.mockResolvedValue(resident);
		mockWrapEngineDocument.mockReturnValue(savedOrder);
		mockLocalPatch.mockResolvedValue({ document: savedOrder });

		const { result } = renderHook(() => useAddItemToOrder());
		await act(async () => {
			await result.current.addItemToOrder('line_items', {
				product_id: 1,
				quantity: 1,
				price: 5,
				meta_data: [],
			} as never);
		});

		// useAddProduct skipped its own increment path (its order still looks new),
		// so the merge has to happen here — a second line would never merge again.
		expect(mockInsertEngineResident).not.toHaveBeenCalled();
		expect(mockLocalPatch).toHaveBeenCalledTimes(1);
		const patched = mockLocalPatch.mock.calls[0][0].data.line_items;
		expect(patched).toHaveLength(1);
		expect(patched[0]).toMatchObject({ product_id: 1, quantity: 2, total: '10' });
		expect(patched[0].meta_data).toEqual([{ key: '_woocommerce_pos_uuid', value: 'line-1' }]);
	});

	it('appends when the resident already holds more than one line for the product', async () => {
		order.isNew = true;
		const lines = [
			{ product_id: 1, quantity: 1, price: 5, meta_data: [] },
			{ product_id: 1, quantity: 1, price: 5, meta_data: [] },
		];
		const resident = {
			...CREATE_QUEUED,
			payload: { uuid: 'order-uuid', line_items: lines },
			toMutableJSON: () => ({ payload: { uuid: 'order-uuid', line_items: lines } }),
		};
		const savedOrder = { ...resident.payload, getLatest: () => savedOrder };
		mockFindEngineResident.mockResolvedValue(resident);
		mockWrapEngineDocument.mockReturnValue(savedOrder);
		mockLocalPatch.mockResolvedValue({ document: savedOrder });

		const { result } = renderHook(() => useAddItemToOrder());
		await act(async () => {
			await result.current.addItemToOrder('line_items', {
				product_id: 1,
				quantity: 1,
				price: 5,
				meta_data: [],
			} as never);
		});

		// Ambiguous match: the callers append too, rather than guess a line.
		expect(mockLocalPatch.mock.calls[0][0].data.line_items).toHaveLength(3);
	});

	it('keeps miscellaneous products on their own line', async () => {
		order.isNew = true;
		const lines = [{ product_id: 0, quantity: 1, price: 5, meta_data: [] }];
		const resident = {
			...CREATE_QUEUED,
			payload: { uuid: 'order-uuid', line_items: lines },
			toMutableJSON: () => ({ payload: { uuid: 'order-uuid', line_items: lines } }),
		};
		const savedOrder = { ...resident.payload, getLatest: () => savedOrder };
		mockFindEngineResident.mockResolvedValue(resident);
		mockWrapEngineDocument.mockReturnValue(savedOrder);
		mockLocalPatch.mockResolvedValue({ document: savedOrder });

		const { result } = renderHook(() => useAddItemToOrder());
		await act(async () => {
			await result.current.addItemToOrder('line_items', {
				product_id: 0,
				quantity: 1,
				price: 7,
				meta_data: [],
			} as never);
		});

		expect(mockLocalPatch.mock.calls[0][0].data.line_items).toHaveLength(2);
	});

	it('retries the create for a skeleton resident whose create was never queued', async () => {
		order.isNew = true;
		const skeletonPayload = { uuid: 'order-uuid', line_items: [{ product_id: 1, quantity: 1 }] };
		const skeleton = {
			local: { dirty: false, pendingMutationIds: [] },
			sync: { revision: '', source: 'skeleton' },
			payload: skeletonPayload,
			toMutableJSON: () => ({ payload: skeletonPayload }),
			remove: jest.fn().mockResolvedValue(undefined),
		};
		mockFindEngineResident.mockResolvedValue(skeleton);
		mockPatchEngineResident.mockImplementation(
			async ({ changes }: { changes: Record<string, unknown> }) => {
				const payload = { ...skeletonPayload, ...changes };
				return { payload, toMutableJSON: () => ({ payload }) };
			}
		);
		mockWrapEngineDocument.mockImplementation((_collection, resident: { payload: object }) => {
			const savedOrder = { ...resident.payload, getLatest: () => savedOrder };
			return savedOrder;
		});
		mockWrite.mockResolvedValue({ mutationId: 'mutation-2' });

		const { result } = renderHook(() => useAddItemToOrder());
		await act(async () => {
			await result.current.addItemToOrder('line_items', {
				product_id: 2,
				quantity: 1,
				meta_data: [],
			} as never);
		});

		// The server has never seen this order, so an update would 404 forever.
		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(mockInsertEngineResident).not.toHaveBeenCalled();
		expect(mockPatchEngineResident).toHaveBeenCalledWith(
			expect.objectContaining({
				collection: 'orders',
				recordId: 'order-uuid',
				changes: {
					line_items: [{ product_id: 1, quantity: 1 }, expect.objectContaining({ product_id: 2 })],
				},
			})
		);
		expect(mockWrite).toHaveBeenCalledTimes(1);
		expect(mockWrite).toHaveBeenCalledWith(
			expect.objectContaining({ operation: 'create', recordId: 'order-uuid' })
		);
		expect(mockSetCurrentOrderID).toHaveBeenCalledWith('order-uuid');
	});

	it('keeps the orphaned skeleton and its lines when the retried create fails again', async () => {
		order.isNew = true;
		const skeletonPayload = { uuid: 'order-uuid', line_items: [{ product_id: 1, quantity: 1 }] };
		const patchedRemove = jest.fn().mockResolvedValue(undefined);
		const skeleton = {
			local: { dirty: false, pendingMutationIds: [] },
			sync: { revision: '' },
			payload: skeletonPayload,
			toMutableJSON: () => ({ payload: skeletonPayload }),
			remove: jest.fn().mockResolvedValue(undefined),
		};
		mockFindEngineResident.mockResolvedValue(skeleton);
		mockPatchEngineResident.mockImplementation(
			async ({ changes }: { changes: Record<string, unknown> }) => {
				const payload = { ...skeletonPayload, ...changes };
				return { payload, toMutableJSON: () => ({ payload }), remove: patchedRemove };
			}
		);
		mockWrite.mockRejectedValue(new Error('write: scope moved during enqueue'));

		const { result } = renderHook(() => useAddItemToOrder());
		await act(async () => {
			await expect(
				result.current.addItemToOrder('line_items', {
					product_id: 2,
					quantity: 1,
					meta_data: [],
				} as never)
			).rejects.toThrow('scope moved during enqueue');
		});

		// Rolling this one back would discard lines the cashier already scanned.
		expect(skeleton.remove).not.toHaveBeenCalled();
		expect(patchedRemove).not.toHaveBeenCalled();
	});

	it('rolls back the skeleton resident when the create fails to enqueue', async () => {
		order.isNew = true;
		const payload = { uuid: 'order-uuid' };
		const remove = jest.fn().mockResolvedValue(undefined);
		mockInsertEngineResident.mockResolvedValue({
			payload,
			toMutableJSON: () => ({ payload }),
			remove,
		});
		mockWrite.mockRejectedValue(new Error('write: scope moved during enqueue'));

		const { result } = renderHook(() => useAddItemToOrder());
		await act(async () => {
			await expect(
				result.current.addItemToOrder('line_items', {
					product_id: 1,
					meta_data: [],
				} as never)
			).rejects.toThrow('scope moved during enqueue');
		});

		// Left behind, the skeleton would look to the next scan like a created order.
		expect(remove).toHaveBeenCalledTimes(1);
		expect(mockSetCurrentOrderID).not.toHaveBeenCalled();
	});

	it('checks stock inside the append chain so overlapping adds see the latest cart', async () => {
		mockStockGuardEnabled = true;
		mockCheckCartStock.mockImplementation(
			async ({ lineItems }: { lineItems: Record<string, unknown>[] }) => ({
				allowed: lineItems.length === 0,
				warning: null,
				available: 1,
				name: 'Item',
			})
		);
		mockLocalPatch.mockImplementation(
			async ({ data }: { data: { line_items: Record<string, unknown>[] } }) => {
				order.line_items = data.line_items;
				return { changes: data, document: order };
			}
		);

		const { result: firstHook } = renderHook(() => useAddItemToOrder());
		const { result: secondHook } = renderHook(() => useAddItemToOrder());
		let firstAppend!: Promise<unknown>;
		let secondAppend!: Promise<unknown>;
		act(() => {
			firstAppend = firstHook.current.addItemToOrder('line_items', {
				product_id: 1,
				meta_data: [],
			} as never);
			secondAppend = secondHook.current.addItemToOrder('line_items', {
				product_id: 1,
				meta_data: [],
			} as never);
		});
		await act(async () => Promise.all([firstAppend, secondAppend]));

		expect(mockCheckCartStock.mock.calls.map(([args]) => args.lineItems.length)).toEqual([0, 1]);
		expect(mockLocalPatch).toHaveBeenCalledTimes(1);
	});
});
