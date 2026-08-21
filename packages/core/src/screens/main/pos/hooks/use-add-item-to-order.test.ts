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
const mockCalculateLineItemTaxesAndTotals = jest.fn();
let mockStockGuardEnabled = false;

const mockRemoveTemporaryOrder = jest.fn();

function completeEngineRecord(record: Record<string, any> | null) {
	if (!record) return null;
	if (!record.getLatest) record.getLatest = () => record;
	return record;
}

jest.mock('observable-hooks', () => ({
	useObservableEagerState: () => 'billing',
}));

jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({
		wpCredentials: { id: 7 },
		store: { id: 11, tax_based_on$: {} },
	}),
}));

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
	payload: { uuid: string; id: number; line_items: Record<string, unknown>[] };
} = {
	uuid: 'order-uuid',
	payload: { uuid: 'order-uuid', id: 42, line_items: [] },
	getLatest: () => order,
	toJSON: () => ({ payload: { uuid: 'order-uuid', id: 42, line_items: [] } }),
	toMutableJSON: () => ({ payload: { uuid: 'order-uuid', id: 42, line_items: [] } }),
	remove: async () => undefined,
};

jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({ engine: { write: mockWrite } }),
}));

jest.mock('uuid', () => ({
	v4: () => 'line-item-uuid',
}));

jest.mock('../contexts/current-order/temporary-order', () => ({
	removeTemporaryOrder: (uuid: string) => mockRemoveTemporaryOrder(uuid),
}));

jest.mock('../../../../hooks/use-local-date', () => ({
	convertLocalDateToUTCString: () => '2026-07-14T00:00:00',
}));

jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	documentRecordId: (document: { uuid?: string }) => document.uuid ?? null,
	findEngineResident: async (...args: unknown[]) =>
		completeEngineRecord(await mockFindEngineResident(...args)),
	insertEngineResident: async (...args: unknown[]) =>
		completeEngineRecord(await mockInsertEngineResident(...args)),
	patchEngineResident: async (...args: unknown[]) =>
		completeEngineRecord(await mockPatchEngineResident(...args)),
	useLocalMutation: () => ({ localPatch: mockLocalPatch }),
}));

jest.mock('../contexts/current-order', () => ({
	// The hook resolves the order at event time now, rather than subscribing during render.
	useCurrentOrderActions: () => ({
		getCurrentOrderRecord: () => order,
		setCurrentOrderID: mockSetCurrentOrderID,
	}),
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
		order.payload.line_items = [];
		order.isNew = false;
		order.toJSON = () => ({ payload: { ...order.payload } });
		order.toMutableJSON = () => ({ payload: { ...order.payload } });
	});

	it('creates an engine order from a worker-cloneable temporary-order snapshot', async () => {
		const nestedProxy = new Proxy({ first_name: 'Guest' }, {});
		const residentPayloadProxy = new Proxy({ status: 'pos-open' }, {});
		order.isNew = true;
		order.toJSON = () => ({ payload: { ...order.payload, billing: nestedProxy } });
		order.toMutableJSON = () => ({
			payload: { ...order.payload, billing: { first_name: 'Guest' } },
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

	it('stamps missing POS identity meta before inserting a new engine order', async () => {
		order.isNew = true;
		mockInsertEngineResident.mockImplementation(
			async ({ payload }: { payload: Record<string, unknown> }) => ({
				toMutableJSON: () => ({ payload }),
			})
		);
		mockWrite.mockResolvedValue({ mutationId: 'mutation-1' });

		const { result } = renderHook(() => useAddItemToOrder());
		await act(async () => {
			await result.current.addItemToOrder('line_items', {
				product_id: 1,
				meta_data: [],
			} as never);
		});

		expect(mockInsertEngineResident.mock.calls[0][0].payload.meta_data).toEqual(
			expect.arrayContaining([
				{ key: '_pos_user', value: '7' },
				{ key: '_pos_store', value: '11' },
			])
		);
		// The insert payload is the WIRE body extracted from the temp record's payload —
		// a face regression that spreads the engine envelope instead loses the wire
		// fields (id lives inside .payload) and smuggles envelope keys into the payload.
		const insertPayload = mockInsertEngineResident.mock.calls[0][0].payload;
		expect(insertPayload.id).toBe(42);
		expect(insertPayload).not.toHaveProperty('payload');
		expect(insertPayload).not.toHaveProperty('sync');
		expect(insertPayload).not.toHaveProperty('local');
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
				order.payload.line_items = data.line_items;
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

		expect(order.payload.line_items.map((item) => item.product_id)).toEqual([1, 2]);
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
		mockStockGuardEnabled = true;
		const resident = {
			...CREATE_QUEUED,
			payload: { uuid: 'order-uuid', line_items: [{ product_id: 1 }] },
			toMutableJSON: () => ({
				payload: { uuid: 'order-uuid', line_items: [{ product_id: 1 }] },
			}),
		};
		mockInsertEngineResident.mockResolvedValue(resident);
		mockWrite.mockResolvedValue({ mutationId: 'mutation-1' });
		mockLocalPatch.mockResolvedValue({ document: resident });

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
			document: resident,
			data: { line_items: [{ product_id: 1 }, expect.objectContaining({ product_id: 2 })] },
		});
		// Stock is validated on both adds, and the second one sees the recovered
		// resident's line — the lookup runs before the stock check, not after.
		expect(mockCheckCartStock).toHaveBeenCalledTimes(2);
		expect(mockCheckCartStock.mock.calls.map(([args]) => args.lineItems.length)).toEqual([0, 1]);
	});

	it('reuses an acked order that carries a server id but no revision', async () => {
		order.isNew = true;
		// What a created order looks like once wc/v3 acks it: the queue row is gone
		// (not dirty, nothing pending) and the ack stamped `remoteId`. Woo answers
		// with a bare order, so `sync.revision` NEVER moves off '' — reading the
		// revision alone would call this an orphan and create the order twice.
		const ackedPayload = { uuid: 'order-uuid', id: 4711, line_items: [{ product_id: 1 }] };
		const resident = {
			local: { dirty: false, pendingMutationIds: [] },
			sync: { revision: '', source: 'skeleton' },
			remoteId: '4711',
			payload: ackedPayload,
			toMutableJSON: () => ({ payload: ackedPayload }),
			remove: jest.fn().mockResolvedValue(undefined),
		};
		mockFindEngineResident.mockResolvedValue(resident);
		mockLocalPatch.mockResolvedValue({ document: resident });

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
		mockInsertEngineResident.mockResolvedValue(resident);
		mockWrite.mockResolvedValue({ mutationId: 'mutation-1' });
		mockLocalPatch.mockResolvedValue({ document: resident });
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
		mockFindEngineResident.mockResolvedValue(resident);
		mockLocalPatch.mockResolvedValue({ document: resident });

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

	it('merges two overlapping scans of one product on a persisted order', async () => {
		// No temporary order here: the cart is already persisted, so useAddProduct DOES
		// run its duplicate check — but both scans run it before either patch lands, so
		// both see an empty cart and arrive as appends.
		let releaseFirst!: () => void;
		const firstPatchMayFinish = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		let calls = 0;
		mockLocalPatch.mockImplementation(
			async ({ data }: { data: { line_items: Record<string, unknown>[] } }) => {
				calls += 1;
				if (calls === 1) await firstPatchMayFinish;
				order.payload.line_items = data.line_items;
				return { changes: data, document: order };
			}
		);

		const { result: firstHook } = renderHook(() => useAddItemToOrder());
		const { result: secondHook } = renderHook(() => useAddItemToOrder());
		let firstScan!: Promise<unknown>;
		let secondScan!: Promise<unknown>;
		act(() => {
			firstScan = firstHook.current.addItemToOrder('line_items', {
				product_id: 1,
				quantity: 1,
				price: 5,
				meta_data: [],
			} as never);
			secondScan = secondHook.current.addItemToOrder('line_items', {
				product_id: 1,
				quantity: 1,
				price: 5,
				meta_data: [],
			} as never);
		});
		await Promise.resolve();
		releaseFirst();
		await act(async () => Promise.all([firstScan, secondScan]));

		expect(mockLocalPatch).toHaveBeenCalledTimes(2);
		expect(order.payload.line_items).toHaveLength(1);
		expect(order.payload.line_items[0]).toMatchObject({ product_id: 1, quantity: 2, total: '10' });
	});

	it('merges a repeat scan into its own variation line, not a sibling variation', async () => {
		order.isNew = true;
		// Two variations of one parent product — the everyday variable-product cart.
		const lines = [
			{
				product_id: 1,
				variation_id: 11,
				quantity: 1,
				price: 5,
				meta_data: [{ key: '_woocommerce_pos_uuid', value: 'line-11' }],
			},
			{
				product_id: 1,
				variation_id: 12,
				quantity: 1,
				price: 5,
				meta_data: [{ key: '_woocommerce_pos_uuid', value: 'line-12' }],
			},
		];
		const resident = {
			...CREATE_QUEUED,
			payload: { uuid: 'order-uuid', line_items: lines },
			toMutableJSON: () => ({ payload: { uuid: 'order-uuid', line_items: lines } }),
		};
		mockFindEngineResident.mockResolvedValue(resident);
		mockLocalPatch.mockResolvedValue({ document: resident });

		const { result } = renderHook(() => useAddItemToOrder());
		await act(async () => {
			await result.current.addItemToOrder('line_items', {
				product_id: 1,
				variation_id: 11,
				quantity: 1,
				price: 5,
				meta_data: [],
			} as never);
		});

		// variation_id is half the match key. Matching on product_id alone sees two
		// lines here, calls the match ambiguous and appends a third — so the scanned
		// variation splits instead of merging, and the cart never recovers.
		const patched = mockLocalPatch.mock.calls[0][0].data.line_items;
		expect(patched).toHaveLength(2);
		expect(patched[0]).toMatchObject({ variation_id: 11, quantity: 2, total: '10' });
		expect(patched[1]).toMatchObject({ variation_id: 12, quantity: 1 });
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
		mockFindEngineResident.mockResolvedValue(resident);
		mockLocalPatch.mockResolvedValue({ document: resident });

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
		mockFindEngineResident.mockResolvedValue(resident);
		mockLocalPatch.mockResolvedValue({ document: resident });

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
					meta_data: expect.arrayContaining([
						{ key: '_pos_user', value: '7' },
						{ key: '_pos_store', value: '11' },
					]),
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

	it('merges a repeat scan that lands while the order is still being created', async () => {
		order.isNew = true;
		mockInsertEngineResident.mockImplementation(
			async ({ payload }: { payload: Record<string, unknown> }) => ({
				payload,
				toMutableJSON: () => ({ payload }),
			})
		);
		mockWrite.mockResolvedValue({ mutationId: 'mutation-1' });
		mockLocalPatch.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
			changes: data,
			document: order,
		}));

		const { result: firstHook } = renderHook(() => useAddItemToOrder());
		const { result: secondHook } = renderHook(() => useAddItemToOrder());
		await act(async () => {
			await Promise.all([
				firstHook.current.addItemToOrder('line_items', {
					product_id: 1,
					quantity: 1,
					price: 5,
					meta_data: [],
				} as never),
				secondHook.current.addItemToOrder('line_items', {
					product_id: 1,
					quantity: 1,
					price: 5,
					meta_data: [],
				} as never),
			]);
		});

		// The second scan queues behind the create and lands on the order the first
		// one just made — no resident lookup involved. Its caller still held the
		// temporary order, so the merge has to happen here too.
		expect(mockInsertEngineResident).toHaveBeenCalledTimes(1);
		expect(mockLocalPatch).toHaveBeenCalledTimes(1);
		const patched = mockLocalPatch.mock.calls[0][0].data.line_items;
		expect(patched).toHaveLength(1);
		expect(patched[0]).toMatchObject({ product_id: 1, quantity: 2, total: '10' });
	});

	it('merges a repeat scan into an orphaned skeleton while retrying its create', async () => {
		order.isNew = true;
		const skeletonLine = {
			product_id: 1,
			quantity: 1,
			price: 5,
			meta_data: [{ key: '_woocommerce_pos_uuid', value: 'line-1' }],
		};
		const skeletonPayload = { uuid: 'order-uuid', line_items: [skeletonLine] };
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
		mockWrite.mockResolvedValue({ mutationId: 'mutation-2' });

		const { result } = renderHook(() => useAddItemToOrder());
		await act(async () => {
			await result.current.addItemToOrder('line_items', {
				product_id: 1,
				quantity: 1,
				price: 5,
				meta_data: [],
			} as never);
		});

		// The retried create carries ONE line at quantity 2 — the skeleton's own
		// line, not a duplicate of it.
		const retried = mockPatchEngineResident.mock.calls[0][0].changes.line_items;
		expect(retried).toHaveLength(1);
		expect(retried[0]).toMatchObject({ product_id: 1, quantity: 2, total: '10' });
		expect(mockWrite).toHaveBeenCalledWith(
			expect.objectContaining({
				operation: 'create',
				payload: expect.objectContaining({
					line_items: [expect.objectContaining({ quantity: 2 })],
				}),
			})
		);
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
				order.payload.line_items = data.line_items;
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
