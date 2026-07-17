import {
	clearStockRejection,
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
