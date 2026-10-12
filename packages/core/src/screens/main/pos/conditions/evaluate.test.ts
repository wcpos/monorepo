import { conditionRules, type ConditionSnapshot, evaluateConditions } from './evaluate';

const ON = conditionRules(true);
const line = (uuid: string, quantity: number, productId = 1, variationId = 0) => ({
	uuid,
	productId,
	variationId,
	quantity,
	name: uuid.toUpperCase(),
});
const managed = (stock_quantity: number, backorders = 'no') => ({
	manage_stock: true,
	stock_quantity,
	backorders,
});
const snapshot = (
	lines: ConditionSnapshot['lines'],
	stock: ConditionSnapshot['stock']
): ConditionSnapshot => ({ lines, stock });

describe('evaluateConditions (stock)', () => {
	it('passes a line within its stock, and a product that does not manage stock', () => {
		expect(
			evaluateConditions(
				snapshot([line('a', 2)], { '1:0': { product: managed(2), variation: null } }),
				ON
			)
		).toEqual([]);
		expect(
			evaluateConditions(
				snapshot([line('a', 99)], {
					'1:0': { product: { manage_stock: false, stock_status: 'instock' }, variation: null },
				}),
				ON
			)
		).toEqual([]);
	});

	it('a line over its stock is unmet: reduce, with the catalog string and its own params', () => {
		expect(
			evaluateConditions(
				snapshot([line('a', 3)], { '1:0': { product: managed(2), variation: null } }),
				ON
			)
		).toEqual([
			{
				id: 'stock',
				reasonKey: 'pos_cart.only_n_available',
				params: { quantity: 2, name: 'A' },
				lineUuid: 'a',
				fix: 'reduce',
				available: 2,
			},
		]);
	});

	it('nothing left, or nothing below zero, is remove', () => {
		for (const level of [0, -2]) {
			expect(
				evaluateConditions(
					snapshot([line('a', 1)], { '1:0': { product: managed(level), variation: null } }),
					ON
				)
			).toMatchObject([{ fix: 'remove', available: level }]);
		}
	});

	it.each([
		['yes', []],
		['notify', []],
		['no', [{ lineUuid: 'a', fix: 'remove' }]],
	])(
		'backorders %s at zero: only a refused backorder is unmet (a warning is not)',
		(backorders, expected) => {
			expect(
				evaluateConditions(
					snapshot([line('a', 1)], { '1:0': { product: managed(0, backorders), variation: null } }),
					ON
				)
			).toMatchObject(expected);
		}
	);

	it('two lines of one product count once against its stock', () => {
		const stock = { '1:0': { product: managed(3), variation: null } };
		// Each fits alone; together they ask for 4 of 3.
		expect(
			evaluateConditions(snapshot([line('a', 2), line('b', 2)], stock), ON).map((u) => u.lineUuid)
		).toEqual(['a', 'b']);
		expect(evaluateConditions(snapshot([line('a', 2), line('b', 1)], stock), ON)).toEqual([]);
	});

	it('a variation that manages its own stock is judged on it; one that does not, on its parent', () => {
		const own = { product: managed(10), variation: managed(1) };
		expect(evaluateConditions(snapshot([line('a', 2, 1, 7)], { '1:7': own }), ON)).toMatchObject([
			{ params: { quantity: 1 }, available: 1 },
		]);
		const parent = { product: managed(3), variation: { manage_stock: 'parent' as const } };
		// Two different variations of a parent-managed product draw on the same 3.
		expect(
			evaluateConditions(
				snapshot([line('a', 2, 1, 7), line('b', 2, 1, 8)], { '1:7': parent, '1:8': parent }),
				ON
			)
		).toMatchObject([
			{ lineUuid: 'a', available: 3 },
			{ lineUuid: 'b', available: 3 },
		]);
	});

	it('a record the catalog does not hold is unmet as out of stock: remove', () => {
		expect(evaluateConditions(snapshot([line('a', 1)], { '1:0': null }), ON)).toEqual([
			{
				id: 'stock',
				reasonKey: 'pos_products.out_of_stock',
				params: { name: 'A' },
				lineUuid: 'a',
				fix: 'remove',
				available: null,
			},
		]);
	});

	it('an unmanaged product marked out of stock is unmet as out of stock', () => {
		const stock = { '1:0': { product: { stock_status: 'outofstock' }, variation: null } };
		expect(evaluateConditions(snapshot([line('a', 1)], stock), ON)).toMatchObject([
			{ reasonKey: 'pos_products.out_of_stock', fix: 'remove' },
		]);
	});

	it('a disabled rule judges nothing (overselling allowed)', () => {
		expect(
			evaluateConditions(snapshot([line('a', 5)], { '1:0': null }), conditionRules(false))
		).toEqual([]);
	});

	it('keeps the order of the lines', () => {
		const stock = {
			'1:0': null,
			'2:0': { product: managed(0), variation: null },
			'3:0': { product: managed(9), variation: null },
		};
		const lines = [line('z', 1, 2), line('m', 1, 3), line('a', 1, 1)];
		expect(evaluateConditions(snapshot(lines, stock), ON).map((u) => u.lineUuid)).toEqual([
			'z',
			'a',
		]);
	});
});
