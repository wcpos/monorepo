import {
	clearStockRejection,
	findActiveStockRejection,
	parseInsufficientStockError,
	setStockRejection,
	stockRejection$,
} from './stock-rejection';

describe('parseInsufficientStockError', () => {
	const items = [
		{
			product_id: 12,
			variation_id: 34,
			name: 'Hoodie – Blue, M',
			requested: 5,
			available: 3,
		},
	];

	it('extracts items from an axios-shaped rejection', () => {
		const error = {
			response: {
				data: {
					code: 'wcpos_insufficient_stock',
					message: 'x',
					data: { status: 400, items },
				},
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
			parseInsufficientStockError({
				response: { data: { code: 'wcpos_invalid_tendered_amount' } },
			})
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

describe('findActiveStockRejection', () => {
	const items = [
		{ product_id: 12, variation_id: 34, requested: 2, available: 3 },
		{ product_id: 12, variation_id: 35, requested: 2, available: 3 },
	];
	const lineItems = [
		{ product_id: 12, variation_id: 34, quantity: 2 },
		{ product_id: 12, variation_id: 35, quantity: 2 },
	];

	it('ignores a rejection belonging to a different order', () => {
		expect(
			findActiveStockRejection({
				stockRejection: { orderUuid: 'order-a', items },
				orderUuid: 'order-b',
				item: lineItems[0],
				lineItems,
			})
		).toBeNull();
	});

	it('keeps shared-stock lines highlighted until their rejection cohort is valid', () => {
		expect(
			findActiveStockRejection({
				stockRejection: { orderUuid: 'order-a', items },
				orderUuid: 'order-a',
				item: lineItems[0],
				lineItems,
			})
		).toEqual(items[0]);

		expect(
			findActiveStockRejection({
				stockRejection: { orderUuid: 'order-a', items },
				orderUuid: 'order-a',
				item: lineItems[0],
				lineItems: [lineItems[0], { ...lineItems[1], quantity: 1 }],
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
