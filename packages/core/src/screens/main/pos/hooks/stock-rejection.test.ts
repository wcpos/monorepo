import {
	clearStockRejection,
	findActiveStockRejection,
	parseInsufficientStockError,
	setStockRejection,
	stockRejection$,
} from './stock-rejection';

describe('parseInsufficientStockError', () => {
	const items = [
		{ product_id: 12, variation_id: 34, name: 'Hoodie – Blue, M', requested: 5, available: 3 },
	];

	it('extracts items from an axios-shaped rejection', () => {
		const error = {
			response: {
				data: { code: 'wcpos_insufficient_stock', message: 'x', data: { status: 400, items } },
			},
		};
		expect(parseInsufficientStockError(error)).toEqual(items);
	});

	it('accepts a bare WP_Error body', () => {
		const body = { code: 'wcpos_insufficient_stock', data: { items } };
		expect(parseInsufficientStockError(body)).toEqual(items);
	});

	it('returns null for other error codes, malformed bodies, and non-objects', () => {
		expect(
			parseInsufficientStockError({ response: { data: { code: 'wcpos_invalid_tendered_amount' } } })
		).toBeNull();
		expect(parseInsufficientStockError({ code: 'wcpos_insufficient_stock' })).toBeNull();
		expect(parseInsufficientStockError(new Error('network'))).toBeNull();
		expect(parseInsufficientStockError(null)).toBeNull();
	});

	it('drops malformed item rows', () => {
		const body = {
			code: 'wcpos_insufficient_stock',
			data: { items: [items[0], null, { name: 'no ids' }] },
		};
		expect(parseInsufficientStockError(body)).toEqual(items);
	});
});

describe('stockRejection$', () => {
	it('sets and clears the shared rejection state', () => {
		setStockRejection({ orderUuid: 'abc', items: [] });
		expect(stockRejection$.getValue()).toEqual({ orderUuid: 'abc', items: [] });
		clearStockRejection();
		expect(stockRejection$.getValue()).toBeNull();
	});
});

describe('findActiveStockRejection', () => {
	const item = { product_id: 12, variation_id: 34, quantity: 2 };
	const rejection = {
		orderUuid: 'order-a',
		items: [{ product_id: 12, variation_id: 34, requested: 2, available: 1 }],
	};

	it('ignores rejection state from a different order', () => {
		expect(findActiveStockRejection(rejection, 'order-b', item, [item])).toBeNull();
		expect(findActiveStockRejection(rejection, 'order-a', item, [item])).toEqual(
			rejection.items[0]
		);
	});

	it('keeps sibling variation highlights until parent stock usage is valid', () => {
		const sibling = { product_id: 12, variation_id: 35, quantity: 2 };
		const parentRejection = {
			orderUuid: 'order-a',
			items: [
				{ product_id: 12, variation_id: 34, requested: 2, available: 3 },
				{ product_id: 12, variation_id: 35, requested: 2, available: 3 },
			],
		};

		expect(findActiveStockRejection(parentRejection, 'order-a', item, [item, sibling])).toEqual(
			parentRejection.items[0]
		);
		expect(
			findActiveStockRejection(parentRejection, 'order-a', item, [
				item,
				{ ...sibling, quantity: 1 },
			])
		).toBeNull();
	});
});
