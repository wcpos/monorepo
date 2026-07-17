import {
	clearStockRejection,
	getStockRejectionForLine,
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

describe('getStockRejectionForLine', () => {
	const rejection = {
		orderUuid: 'order-a',
		items: [
			{ product_id: 12, variation_id: 34, stock_owner_id: 12, requested: 2, available: 3 },
			{ product_id: 12, variation_id: 35, stock_owner_id: 12, requested: 2, available: 3 },
		],
	};

	it('does not leak a rejection to another order', () => {
		expect(
			getStockRejectionForLine({
				stockRejection: rejection,
				orderUuid: 'order-b',
				lineItems: [{ product_id: 12, variation_id: 34, quantity: 4 }],
				lineItem: { product_id: 12, variation_id: 34, quantity: 4 },
			})
		).toBeNull();
	});

	it('keeps sibling lines highlighted until aggregate usage is within availability', () => {
		const lineItem = { product_id: 12, variation_id: 34, quantity: 2 };
		expect(
			getStockRejectionForLine({
				stockRejection: rejection,
				orderUuid: 'order-a',
				lineItems: [lineItem, { product_id: 12, variation_id: 35, quantity: 2 }],
				lineItem,
			})
		).toEqual(rejection.items[0]);

		expect(
			getStockRejectionForLine({
				stockRejection: rejection,
				orderUuid: 'order-a',
				lineItems: [lineItem, { product_id: 12, variation_id: 35, quantity: 1 }],
				lineItem,
			})
		).toBeNull();
	});

	it('does not aggregate independently managed sibling variations', () => {
		const independentRejection = {
			orderUuid: 'order-a',
			items: [
				{ product_id: 12, variation_id: 34, stock_owner_id: 34, requested: 2, available: 1 },
				{ product_id: 12, variation_id: 35, stock_owner_id: 35, requested: 2, available: 1 },
			],
		};
		const lineItem = { product_id: 12, variation_id: 34, quantity: 1 };

		expect(
			getStockRejectionForLine({
				stockRejection: independentRejection,
				orderUuid: 'order-a',
				lineItems: [lineItem, { product_id: 12, variation_id: 35, quantity: 2 }],
				lineItem,
			})
		).toBeNull();
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
