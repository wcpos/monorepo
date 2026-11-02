import { conditionRules } from './evaluate';
import { countConditionsInSlot } from './snapshot';

type Line = Record<string, unknown>;
const ON = conditionRules(true);
const line = (uuid: string, quantity: number, extra: Line = {}, meta: Line[] = []) => ({
	product_id: 1,
	variation_id: 0,
	quantity,
	name: uuid.toUpperCase(),
	meta_data: [{ key: '_woocommerce_pos_uuid', value: uuid }, ...meta],
	...extra,
});
const reduced = (value: string) => [{ key: '_reduced_stock', value }];
const count = (lines: Line[], records: Record<string, Line | null>) =>
	countConditionsInSlot(
		{ getLatest: () => ({ payload: { line_items: lines as never } }) },
		{ read: { catalog: async (kind, id) => records[`${kind}:${id}`] ?? null } },
		ON
	);
const managed = (stock_quantity: number) => ({
	manage_stock: true,
	stock_quantity,
	backorders: 'no',
});

describe('countConditionsInSlot: the snapshot it judges', () => {
	it('a line that already reduced stock (a reopened order) is not counted again', async () => {
		expect(await count([line('a', 1, {}, reduced('1'))], { 'product:1': managed(0) })).toEqual([]);
	});

	it('only the units not yet taken are demanded: the extra unit at 0 left is out of stock', async () => {
		expect(await count([line('a', 2, {}, reduced('1'))], { 'product:1': managed(0) })).toEqual([
			{
				id: 'stock',
				reasonKey: 'pos_products.out_of_stock',
				params: { name: 'A' },
				lineUuid: 'a',
				fix: 'remove',
				available: 0,
			},
		]);
	});

	it('a reduced sibling line adds nothing to another line of the same stock', async () => {
		const lines = [line('a', 2, {}, reduced('2')), line('b', 1)];
		expect(await count(lines, { 'product:1': managed(1) })).toEqual([]);
	});

	it('miscellaneous and retired lines are not judged', async () => {
		const lines = [line('misc', 3, { product_id: 0 }), line('gone', 3, { product_id: null })];
		expect(await count(lines, {})).toEqual([]);
	});

	it('a variation the local catalog does not hold is unmet as out of stock', async () => {
		const lines = [line('v', 1, { variation_id: 7 })];
		expect(await count(lines, { 'product:1': managed(9) })).toMatchObject([
			{ lineUuid: 'v', reasonKey: 'pos_products.out_of_stock', fix: 'remove', available: null },
		]);
	});
});
