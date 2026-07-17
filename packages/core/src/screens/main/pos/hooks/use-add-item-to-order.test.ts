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

	it('serializes order mutations so each callback reads the latest cart', async () => {
		const { result } = renderHook(() => useAddItemToOrder());
		const observedCartSizes: number[] = [];
		let releaseFirst!: () => void;
		const firstMutationMayFinish = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		let calls = 0;
		const mutate = async () => {
			observedCartSizes.push(order.line_items.length);
			calls += 1;
			if (calls === 1) await firstMutationMayFinish;
			if (order.line_items.length === 0) {
				order.line_items = [{ product_id: 1 }];
			}
		};

		let mutations!: Promise<void[]>;
		act(() => {
			mutations = Promise.all([
				result.current.runOrderMutation(mutate),
				result.current.runOrderMutation(mutate),
			]);
		});
		await Promise.resolve();
		expect(observedCartSizes).toEqual([0]);
		releaseFirst();
		await act(async () => mutations);

		expect(observedCartSizes).toEqual([0, 1]);
	});
});
