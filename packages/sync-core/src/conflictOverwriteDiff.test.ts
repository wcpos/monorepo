import { describe, expect, it } from 'vitest';

import { diffConflictOverwrite } from './conflictOverwriteDiff';

describe('diffConflictOverwrite', () => {
	it('compares only keys present on both sides', () => {
		expect(
			diffConflictOverwrite(
				{ shared: 'till', pushedOnly: true },
				{ shared: 'store', serverOnly: true }
			)
		).toEqual(['shared']);
	});

	it('skips server-managed and merge-only top-level fields', () => {
		expect(
			diffConflictOverwrite(
				{
					date_modified: 'till',
					date_modified_gmt: 'till',
					_links: { self: 'till' },
					meta_data: [{ id: 1, value: 'till' }],
					_rxdb_digest: 'till',
				},
				{
					date_modified: 'store',
					date_modified_gmt: 'store',
					_links: { self: 'store' },
					meta_data: [{ id: 1, value: 'store' }],
					_rxdb_digest: 'store',
				}
			)
		).toEqual([]);
	});

	it('recurses through objects to depth six and ignores deeper differences', () => {
		expect(
			diffConflictOverwrite(
				{ a: { b: { c: { d: { e: { f: 'till', g: { h: 'till' }, items: [1] } } } } } },
				{ a: { b: { c: { d: { e: { f: 'store', g: { h: 'store' }, items: [1, 2] } } } } } }
			)
		).toEqual(['a.b.c.d.e.f']);
	});

	it('matches identified array elements by id and ignores pushed appends', () => {
		expect(
			diffConflictOverwrite(
				{
					line_items: [{ id: 20, quantity: 3 }, { id: 30, quantity: 1 }, { name: 'new item' }],
				},
				{
					line_items: [
						{ id: 10, quantity: 1 },
						{ id: 20, quantity: 2 },
					],
				}
			)
		).toEqual(['line_items[10]', 'line_items[20].quantity', 'line_items[30]']);
	});

	it('compares arrays without ids positionally and reports a length difference once', () => {
		expect(
			diffConflictOverwrite(
				{ taxes: [{ total: '2.00' }, { total: '3.00' }] },
				{ taxes: [{ total: '2.50' }] }
			)
		).toEqual(['taxes.length', 'taxes[0].total']);
	});

	it('uses Object.is for non-money primitive equality', () => {
		expect(
			diffConflictOverwrite(
				{ sameNull: null, sameBoolean: true, sameNaN: Number.NaN, changed: 'till' },
				{ sameNull: null, sameBoolean: true, sameNaN: Number.NaN, changed: 'store' }
			)
		).toEqual(['changed']);
	});

	it('treats decimal values as equal at the shorter precision', () => {
		expect(
			diffConflictOverwrite(
				{ total: '6.713280', total_tax: 6.71, shipping_total: '6.72' },
				{ total: '6.71', total_tax: '6.713280', shipping_total: '6.713280' }
			)
		).toEqual(['shipping_total']);
	});

	it('compares numeric-looking TEXT exactly — a postcode or phone is not money', () => {
		expect(
			diffConflictOverwrite(
				{ billing: { postcode: '01234', phone: '44123.0', city: 'Leeds' } },
				{ billing: { postcode: '1234', phone: '44123', city: 'Leeds' } }
			)
		).toEqual(['billing.phone', 'billing.postcode']);
	});

	it('ignores a numeric-string id and a server-only line meta row (POS-2VT probe)', () => {
		const size = () => ({ id: 501, key: 'pa_size', value: 'L' });
		const appended = { key: '_wcpos_x', value: '1' };
		const reduced = { id: 502, key: '_reduced_stock', value: '1' };
		const pushed = { id: 11, image: { id: 42, src: 'a' }, meta_data: [size(), appended] };
		const server = { id: 11, image: { id: '42', src: 'a' }, meta_data: [size(), reduced] };
		expect(diffConflictOverwrite({ line_items: [pushed] }, { line_items: [server] })).toEqual([]);
	});

	it('still reports a different id across number and string', () => {
		expect(
			diffConflictOverwrite(
				{ line_items: [{ id: 11, image: { id: 42 } }] },
				{ line_items: [{ id: 11, image: { id: '43' } }] }
			)
		).toEqual(['line_items[11].image.id']);
	});

	it('still reports a changed line meta row and a pushed meta row the server lacks', () => {
		const size = { id: 501, value: 'L' };
		const extra = { id: 503, value: 'x' };
		const pushed = { id: 11, meta_data: [size, extra] };
		const server = { id: 11, meta_data: [{ id: 501, value: 'M' }] };
		expect(diffConflictOverwrite({ line_items: [pushed] }, { line_items: [server] })).toEqual([
			'line_items[11].meta_data[501].value',
			'line_items[11].meta_data[503]',
		]);
	});

	it('never throws on malformed JSON-ish shapes', () => {
		expect(() =>
			diffConflictOverwrite(
				null as unknown as Record<string, unknown>,
				[] as unknown as Record<string, unknown>
			)
		).not.toThrow();
		expect(diffConflictOverwrite({ value: null }, { value: [] })).toEqual(['value']);
	});
});
