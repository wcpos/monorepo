/**
 * @jest-environment jsdom
 */
import { serialize } from 'node:v8';

import { act, renderHook } from '@testing-library/react';

import { useAddItemToOrder } from './use-add-item-to-order';
import { useAddProduct } from './use-add-product';
import { useAddVariation } from './use-add-variation';

const mockLocalPatch = jest.fn();
const mockSetCurrentOrderID = jest.fn();
const mockInsertEngineResident = jest.fn();
const mockWrite = jest.fn();
const mockCheckCartStock = jest.fn();
const mockUpdateLineItem = jest.fn();
let stockGuardEnabled = false;

jest.mock('@wcpos/database', () => ({ isRxDocument: () => false }));

jest.mock('./use-cart-stock-guard', () => ({
	useCartStockGuard: () => ({
		stockGuardEnabled,
		checkCartStock: mockCheckCartStock,
		showBackorderWarning: jest.fn(),
	}),
}));

jest.mock('observable-hooks', () => ({
	useObservableEagerState: () => '',
}));

jest.mock('./use-calculate-line-item-tax-and-totals', () => ({
	useCalculateLineItemTaxAndTotals: () => ({
		calculateLineItemTaxesAndTotals: (lineItem: Record<string, unknown>) => lineItem,
	}),
}));

jest.mock('./use-update-line-item', () => ({
	useUpdateLineItem: () => ({ updateLineItem: mockUpdateLineItem }),
}));

jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

jest.mock('../../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: { metaDataKeys$: {} } }),
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
		currentOrder: {
			uuid: order.uuid,
			id: order.id,
			number: '42',
			getLatest: () => order,
		},
		setCurrentOrderID: mockSetCurrentOrderID,
	}),
}));

describe('useAddItemToOrder', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		stockGuardEnabled = false;
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
		mockUpdateLineItem.mockResolvedValue(order);
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

	it.each([
		{
			name: 'product',
			renderAdds: () => {
				const first = renderHook(() => useAddProduct());
				const second = renderHook(() => useAddProduct());
				return [
					() => first.result.current.addProduct({ id: 1, name: 'Product' }),
					() => second.result.current.addProduct({ id: 1, name: 'Product' }),
				];
			},
		},
		{
			name: 'variation',
			renderAdds: () => {
				const first = renderHook(() => useAddVariation());
				const second = renderHook(() => useAddVariation());
				const variation = {
					id: 2,
					getLatest: () => ({ id: 2, name: 'Variation', attributes: [] }),
				} as never;
				const parent = {
					id: 1,
					getLatest: () => ({ id: 1, name: 'Product' }),
				} as never;
				return [
					() => first.result.current.addVariation(variation, parent),
					() => second.result.current.addVariation(variation, parent),
				];
			},
		},
	])('serializes the $name stock check across hook instances', async ({ renderAdds }) => {
		stockGuardEnabled = true;
		let releaseFirstPatch!: () => void;
		const firstPatchMayFinish = new Promise<void>((resolve) => {
			releaseFirstPatch = resolve;
		});
		mockLocalPatch.mockImplementation(
			async ({ data }: { data: { line_items: Record<string, unknown>[] } }) => {
				await firstPatchMayFinish;
				order.line_items = data.line_items;
				return order;
			}
		);
		const [firstAddCall, secondAddCall] = renderAdds();

		let firstAdd!: Promise<unknown>;
		let secondAdd!: Promise<unknown>;
		act(() => {
			firstAdd = firstAddCall();
			secondAdd = secondAddCall();
		});

		await Promise.resolve();
		expect(mockCheckCartStock).toHaveBeenCalledTimes(1);
		releaseFirstPatch();
		await act(async () => Promise.all([firstAdd, secondAdd]));

		expect(mockCheckCartStock).toHaveBeenCalledTimes(2);
		expect(mockCheckCartStock.mock.calls[1]?.[0].lineItems).toHaveLength(1);
	});
});
