import {
	childrenOf,
	descendantIds,
	displayTypeOf,
	orderTerms,
	rootTerms,
	visibleTerms,
} from './term-tree';

const T = (
	id: number,
	name: string,
	extra: Partial<{ parent: number; menu_order: number; count: number; display: string }> = {}
) => ({
	id,
	name,
	count: 1,
	...extra,
});

describe('orderTerms', () => {
	it('orders a hierarchical taxonomy by menu_order then name', () => {
		const out = orderTerms(
			[
				T(1, 'Snacks', { menu_order: 2 }),
				T(2, 'Drinks', { menu_order: 1 }),
				T(3, 'Bakery', { menu_order: 2 }),
			],
			true
		);
		expect(out.map((t) => t.name)).toEqual(['Drinks', 'Bakery', 'Snacks']);
	});
	it('treats a missing menu_order as 0', () => {
		const out = orderTerms([T(1, 'B', { menu_order: 1 }), T(2, 'A')], true);
		expect(out.map((t) => t.name)).toEqual(['A', 'B']);
	});
	it('orders a flat taxonomy by name only, ignoring menu_order', () => {
		const out = orderTerms(
			[T(1, 'Vegan', { menu_order: 0 }), T(2, 'Decaf', { menu_order: 9 })],
			false
		);
		expect(out.map((t) => t.name)).toEqual(['Decaf', 'Vegan']);
	});
	it('compares names case-insensitively and locale-aware', () => {
		const out = orderTerms([T(1, 'éclair'), T(2, 'Apple'), T(3, 'banana')], false);
		expect(out.map((t) => t.name)).toEqual(['Apple', 'banana', 'éclair']);
	});
});

describe('visibleTerms', () => {
	it('hides terms with no catalog count and no synced product', () => {
		expect(
			visibleTerms([T(1, 'A', { count: 0 }), T(2, 'B', { count: 3 })]).map((t) => t.id)
		).toEqual([2]);
	});
	it('hides a term with no count at all', () => {
		expect(visibleTerms([{ id: 1, name: 'A' }])).toEqual([]);
	});
	it('keeps a zero-count term a synced product carries (POS-only products are not in the catalog recount)', () => {
		expect(
			visibleTerms([T(1, 'A', { count: 0 }), T(2, 'B', { count: 0 })], new Set([2])).map(
				(t) => t.id
			)
		).toEqual([2]);
	});
	it('keeps an empty parent whose descendant is visible, so the branch stays reachable', () => {
		const terms = [
			T(1, 'Org', { count: 0 }),
			T(2, 'Mid', { parent: 1, count: 0 }),
			T(3, 'Leaf', { parent: 2, count: 0 }),
			T(4, 'Bare', { parent: 1, count: 0 }),
		];
		expect(visibleTerms(terms, new Set([3])).map((t) => t.id)).toEqual([1, 2, 3]);
	});
	it('does not loop on a parent cycle', () => {
		expect(
			visibleTerms([T(1, 'A', { parent: 2, count: 1 }), T(2, 'B', { parent: 1, count: 0 })]).map(
				(t) => t.id
			)
		).toEqual([1, 2]);
	});
});

describe('rootTerms and childrenOf', () => {
	const terms = [
		T(1, 'Drinks', { menu_order: 1 }),
		T(2, 'Hot', { parent: 1, menu_order: 2 }),
		T(3, 'Cold', { parent: 1, menu_order: 1 }),
		T(4, 'Orphan', { parent: 99 }),
		T(5, 'Empty', { parent: 1, count: 0 }),
	];
	it('roots are parentless or orphaned, ordered and visible', () => {
		expect(rootTerms(terms).map((t) => t.name)).toEqual(['Drinks', 'Orphan']);
	});
	it('an empty parent with a POS-only child is a root, and the child is its child', () => {
		const posOnly = [T(1, 'Org', { count: 0 }), T(2, 'Leaf', { parent: 1, count: 0 })];
		expect(rootTerms(posOnly, new Set([2])).map((t) => t.name)).toEqual(['Org']);
		expect(childrenOf(posOnly, 1, new Set([2])).map((t) => t.name)).toEqual(['Leaf']);
	});
	it('children are the direct, visible, ordered children', () => {
		expect(childrenOf(terms, 1).map((t) => t.name)).toEqual(['Cold', 'Hot']);
	});
});

describe('descendantIds', () => {
	it('returns the term and every descendant, deep', () => {
		const terms = [T(1, 'A'), T(2, 'B', { parent: 1 }), T(3, 'C', { parent: 2 }), T(4, 'D')];
		expect(descendantIds(terms, 1)).toEqual([1, 2, 3]);
	});
	it('includes hidden descendants (their products still belong to the parent)', () => {
		const terms = [T(1, 'A'), T(2, 'B', { parent: 1, count: 0 })];
		expect(descendantIds(terms, 1)).toEqual([1, 2]);
	});
	it('survives a cycle', () => {
		const terms = [T(1, 'A', { parent: 2 }), T(2, 'B', { parent: 1 })];
		expect(descendantIds(terms, 1)).toEqual([1, 2]);
	});
});

describe('displayTypeOf', () => {
	it.each([
		['products', 'products'],
		['subcategories', 'subcategories'],
		['both', 'both'],
		['default', 'both'],
		['', 'both'],
		[undefined, 'both'],
		['garbage', 'both'],
	])('%p → %s', (display, expected) => {
		expect(displayTypeOf({ id: 1, name: 'x', display: display as string })).toBe(expected);
	});
});
