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
	const rejection = {
		orderUuid: 'order-a',
		items: [
			{ product_id: 10, variation_id: 101, requested: 2, available: 3 },
			{ product_id: 10, variation_id: 102, requested: 2, available: 3 },
		],
	};
	const lineItems = [
		{ product_id: 10, variation_id: 101, quantity: 2 },
		{ product_id: 10, variation_id: 102, quantity: 2 },
	];
	const args = {
		stockRejection: rejection,
		orderUuid: 'order-a',
		lineItem: lineItems[0],
		lineItems,
	};

	it('ignores a rejection belonging to another order', () => {
		expect(findActiveStockRejection({ ...args, orderUuid: 'order-b' })).toBeNull();
	});

	it('keeps highlights until aggregate rejected stock usage is valid', () => {
		expect(findActiveStockRejection(args)).toEqual(rejection.items[0]);
		expect(
			findActiveStockRejection({
				...args,
				lineItems: [{ ...lineItems[0], quantity: 1 }, lineItems[1]],
			})
		).toBeNull();
	});

	it('does not group independently rejected variations with coincidentally equal availability', () => {
		const independentRejection = {
			orderUuid: 'order-a',
			items: [
				{ product_id: 10, variation_id: 101, requested: 4, available: 3 },
				{ product_id: 10, variation_id: 102, requested: 4, available: 3 },
			],
		};
		const correctedLines = [
			{ product_id: 10, variation_id: 101, quantity: 2 },
			{ product_id: 10, variation_id: 102, quantity: 4 },
		];

		expect(
			findActiveStockRejection({
				...args,
				stockRejection: independentRejection,
				lineItem: correctedLines[0],
				lineItems: correctedLines,
			})
		).toBeNull();
	});

	it('normalizes fractional aggregate quantities before comparing availability', () => {
		const fractionalRejection = {
			orderUuid: 'order-a',
			items: [
				{ product_id: 10, variation_id: 101, requested: 0.1, available: 0.3 },
				{ product_id: 10, variation_id: 102, requested: 0.2, available: 0.3 },
			],
		};
		const fractionalLines = [
			{ product_id: 10, variation_id: 101, quantity: 0.1 },
			{ product_id: 10, variation_id: 102, quantity: 0.2 },
		];

		expect(
			findActiveStockRejection({
				...args,
				stockRejection: fractionalRejection,
				lineItem: fractionalLines[0],
				lineItems: fractionalLines,
			})
		).toBeNull();
	});
});
