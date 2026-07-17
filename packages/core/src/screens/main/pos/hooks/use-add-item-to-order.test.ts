/**
 * @jest-environment jsdom
 */
import { serialize } from 'node:v8';

import { act, renderHook } from '@testing-library/react';

import { useAddItemToOrder } from './use-add-item-to-order';

const mockLocalPatch = jest.fn();
const mockSetCurrentOrderID = jest.fn();
const mockInsertEngineResident = jest.fn();
const mockWrite = jest.fn();
const mockCheckCartStock = jest.fn();
const mockWrapEngineDocument = jest.fn();
let mockStockGuardEnabled = false;

jest.mock('./use-cart-stock-guard', () => ({
	useCartStockGuard: () => ({
		stockGuardEnabled: mockStockGuardEnabled,
		checkCartStock: mockCheckCartStock,
		showBackorderWarning: jest.fn(),
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
	insertEngineResident: (...args: unknown[]) => mockInsertEngineResident(...args),
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
		mockWrapEngineDocument.mockImplementation((_collection, resident) => resident);
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
		order.toMutableJSON = () => ({ uuid: 'order-uuid', billing: { first_name: 'Guest' } });
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
			async ({ payload }: { payload: Record<string, unknown> }) => {
				const savedOrder = {
					...(payload as { line_items: Record<string, unknown>[] }),
					collection: { name: 'orders' },
					getLatest: () => savedOrder,
				};
				return {
					savedOrder,
					toMutableJSON: () => ({ payload }),
				};
			}
		);
		mockWrapEngineDocument.mockImplementation(
			(_collection, resident: { savedOrder: Record<string, unknown> }) => resident.savedOrder
		);
		mockWrite.mockResolvedValue({ mutationId: 'mutation-1' });

		const { result } = renderHook(() => useAddItemToOrder());
		await act(async () => {
			await Promise.all([
				result.current.addItemToOrder('line_items', {
					product_id: 1,
					quantity: 1,
					meta_data: [],
				} as never),
				result.current.addItemToOrder('line_items', {
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

		const { result } = renderHook(() => useAddItemToOrder());
		let firstAppend!: Promise<unknown>;
		let secondAppend!: Promise<unknown>;
		act(() => {
			firstAppend = result.current.addItemToOrder('line_items', {
				product_id: 1,
				meta_data: [],
			} as never);
			secondAppend = result.current.addItemToOrder('line_items', {
				product_id: 1,
				meta_data: [],
			} as never);
		});
		await act(async () => Promise.all([firstAppend, secondAppend]));

		expect(mockCheckCartStock.mock.calls.map(([args]) => args.lineItems.length)).toEqual([0, 1]);
		expect(mockLocalPatch).toHaveBeenCalledTimes(1);
	});
});
