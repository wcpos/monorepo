/** @jest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { BehaviorSubject, of } from 'rxjs';

import { useCartConditions } from './use-cart-conditions';

let mockPreventOverselling = true;
let mockLineItems: Record<string, unknown>[] = [];
let mockStock: Record<string, Record<number, Record<string, unknown>>> = {};
const mockReadStock = jest.fn(
	async (_runtime: unknown, collection: string, id: number) => mockStock[collection]?.[id] ?? null
);
const mockCatalog$ = {
	products: new BehaviorSubject<unknown[]>([]),
	variations: new BehaviorSubject<unknown[]>([]),
};
const mockRuntime = { engine: {} };
jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => mockRuntime,
	useDocField: (doc: unknown, pick: (doc: unknown) => unknown) => pick(doc),
	useRecordField: (record: { getLatest: () => unknown }, select: (r: unknown) => unknown) =>
		select(record.getLatest()),
	observeEngineDatabases: () => of({}),
	engineCollection: (_db: unknown, name: 'products' | 'variations') => ({
		find: () => ({ $: mockCatalog$[name] }),
	}),
}));
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ store: { prevent_overselling: mockPreventOverselling } }),
}));
jest.mock('../hooks/read-stock-document', () => ({
	readStockDocument: (...args: [unknown, string, number]) => mockReadStock(...args),
}));

const lineItem = (uuid: string, quantity: number) => ({
	product_id: 1,
	variation_id: 0,
	quantity,
	name: 'Belt',
	meta_data: [{ key: '_woocommerce_pos_uuid', value: uuid }],
});
// A record whose `getLatest` reads the current fixture, as an RxDB document's does.
const order = { getLatest: () => ({ payload: { line_items: mockLineItems } }) } as never;
const render = () => renderHook(() => useCartConditions(order));

beforeEach(() => {
	jest.clearAllMocks();
	mockPreventOverselling = true;
	mockLineItems = [lineItem('a', 2)];
	mockStock = { products: { 1: { manage_stock: true, stock_quantity: 5, backorders: 'no' } } };
});

it('re-judges when a sync lowers the level, with no tap', async () => {
	const { result } = render();
	await waitFor(() => expect(mockReadStock).toHaveBeenCalled());
	expect(result.current.unmet).toEqual([]);
	mockStock.products[1] = { manage_stock: true, stock_quantity: 1, backorders: 'no' };
	act(() => mockCatalog$.products.next([{ remoteId: 'changed' }]));
	await waitFor(() =>
		expect(result.current.unmet).toMatchObject([
			{ lineUuid: 'a', reasonKey: 'pos_cart.only_n_available', fix: 'reduce', available: 1 },
		])
	);
});

it('clears the row when a quantity edit brings the line within stock', async () => {
	mockStock.products[1] = { manage_stock: true, stock_quantity: 1, backorders: 'no' };
	const { result, rerender } = render();
	await waitFor(() => expect(result.current.unmet).toHaveLength(1));
	const before = result.current.unmet;
	rerender();
	expect(result.current.unmet).toBe(before); // stable while nothing moved
	mockLineItems = [lineItem('a', 1)];
	rerender();
	await waitFor(() => expect(result.current.unmet).toEqual([]));
});

it('judges nothing and reads nothing with overselling allowed', async () => {
	mockPreventOverselling = false;
	mockStock.products[1] = { manage_stock: true, stock_quantity: 0, backorders: 'no' };
	const { result } = render();
	await act(async () => {});
	expect(result.current.unmet).toEqual([]);
	expect(mockReadStock).not.toHaveBeenCalled();
});

it('re-judges a variation that manages its own stock when the variation moves', async () => {
	mockLineItems = [{ ...lineItem('v', 2), variation_id: 7 }];
	mockStock = {
		products: { 1: { manage_stock: false } },
		variations: { 7: { manage_stock: true, stock_quantity: 5, backorders: 'no' } },
	};
	const { result } = render();
	await waitFor(() => expect(mockReadStock).toHaveBeenCalledWith(mockRuntime, 'variations', 7));
	expect(result.current.unmet).toEqual([]);
	mockStock.variations[7] = { manage_stock: true, stock_quantity: 1, backorders: 'no' };
	act(() => mockCatalog$.variations.next([{ remoteId: 'changed' }]));
	await waitFor(() =>
		expect(result.current.unmet).toMatchObject([{ lineUuid: 'v', available: 1, fix: 'reduce' }])
	);
});
