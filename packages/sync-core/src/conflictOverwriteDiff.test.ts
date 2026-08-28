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
				{ equalWidth: '6.713280', equalType: 6.71, changed: '6.72' },
				{ equalWidth: '6.71', equalType: '6.713280', changed: '6.713280' }
			)
		).toEqual(['changed']);
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
