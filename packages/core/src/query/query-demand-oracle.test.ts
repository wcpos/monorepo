import { compileQuery, requirementsForCompiledQuery } from './query-state-translator';

import type { CollectionKey, QueryStateOf } from './query-state-types';

type CompilableState<C extends CollectionKey> = Omit<QueryStateOf<C>, 'limit'> & {
	limit?: number;
};

function compiledPlan<C extends Exclude<CollectionKey, 'logs'>>(
	collection: C,
	state: CompilableState<C>,
	options: { id: string; targeted?: readonly unknown[]; residual?: boolean }
) {
	const compiled = compileQuery(collection, state, options);
	return {
		requirements: requirementsForCompiledQuery(compiled.demand, { id: options.id }),
		represented: compiled.represented,
	};
}

describe('compiled demand pins for the retired raw-selector callers', () => {
	it('pins observeParentLookup targeted products', () => {
		expect(
			compiledPlan(
				'products',
				{
					search: '',
					filters: { categories: [], brands: [], tags: [] },
					sort: { field: 'id', direction: 'asc' },
				},
				{ id: 'parent-lookup', targeted: [17, 23] }
			)
		).toStrictEqual({
			requirements: [
				{
					id: 'parent-lookup:targeted',
					collection: 'products',
					kind: 'targeted-records',
					remoteIds: ['17', '23'],
				},
			],
			represented: false,
		});
	});

	it('pins the relational variation child search', () => {
		expect(
			compiledPlan(
				'variations',
				{
					search: 'blue',
					filters: { attributeMatches: [], status: 'publish' },
					sort: { field: 'id', direction: 'asc' },
				},
				{ id: 'child-demand' }
			)
		).toStrictEqual({
			requirements: [
				{
					id: 'child-demand:search',
					collection: 'variations',
					kind: 'search',
					term: 'blue',
				},
			],
			represented: false,
		});
	});

	it.each([
		{
			name: 'customers',
			collection: 'customers',
			search: 'alice',
			field: 'last_name',
			expected: {
				id: 'search-select:customers:search',
				collection: 'customers',
				kind: 'search',
				term: 'alice',
				limit: 50,
			},
		},
		{
			name: 'cashiers',
			collection: 'customers',
			search: 'alice',
			field: 'last_name',
			residual: true,
			expected: {
				id: 'search-select:cashiers:search',
				collection: 'customers',
				kind: 'search',
				term: 'alice',
				limit: 50,
			},
		},
		{
			name: 'cashiers without search',
			collection: 'customers',
			search: '',
			field: 'last_name',
			residual: true,
			expected: {
				id: 'search-select:cashiers without search:customers-browse-window',
				collection: 'customers',
				kind: 'customer-browse',
				limit: 50,
				orderby: 'last_name',
				order: 'asc',
			},
		},
		{
			name: 'categories',
			collection: 'products/categories',
			search: 'shirts',
			field: 'name',
			expected: {
				id: 'search-select:categories:reference-refresh',
				collection: 'categories',
				kind: 'refresh',
				priority: 700,
			},
		},
		{
			name: 'brands',
			collection: 'products/brands',
			search: 'acme',
			field: 'name',
			expected: {
				id: 'search-select:brands:reference-refresh',
				collection: 'brands',
				kind: 'refresh',
				priority: 700,
			},
		},
		{
			name: 'tags',
			collection: 'products/tags',
			search: 'sale',
			field: 'name',
			expected: {
				id: 'search-select:tags:reference-refresh',
				collection: 'tags',
				kind: 'refresh',
				priority: 700,
			},
		},
		{
			name: 'coupons',
			collection: 'coupons',
			search: 'summer',
			field: 'code',
			expected: {
				id: 'search-select:coupons:reference-refresh',
				collection: 'coupons',
				kind: 'refresh',
				priority: 700,
			},
		},
	] as const)('pins useSearchSelect for $name', (fixture) => {
		expect(
			compiledPlan(
				fixture.collection,
				{
					search: fixture.search,
					filters: {},
					sort: { field: fixture.field, direction: 'asc' },
					limit: 50,
				},
				{ id: `search-select:${fixture.name}`, residual: 'residual' in fixture }
			)
		).toStrictEqual({ requirements: [fixture.expected], represented: false });
	});

	it('keeps the cashier role selector residual on the compiled read face', () => {
		const compiled = compileQuery(
			'customers',
			{
				search: '',
				filters: {},
				sort: { field: 'last_name', direction: 'asc' },
				limit: 50,
			},
			{ id: 'search-select:cashiers', residual: true }
		);

		expect(compiled.read.complete).toBe(false);
	});

	it('pins the unbounded open-orders browse', () => {
		expect(
			compiledPlan(
				'orders',
				{
					search: '',
					filters: { status: 'pos-open' },
					sort: { field: 'date_completed_gmt', direction: 'asc' },
				},
				{ id: 'pos:open-orders' }
			)
		).toStrictEqual({
			requirements: [
				{
					id: 'pos:open-orders:orders-browse',
					collection: 'orders',
					kind: 'orders-browse',
					status: 'pos-open',
				},
			],
			represented: true,
		});
	});

	it('pins the full categories binding', () => {
		expect(
			compiledPlan(
				'products/categories',
				{
					search: '',
					filters: {},
					sort: { field: 'name', direction: 'asc' },
				},
				{ id: 'all-categories' }
			)
		).toStrictEqual({
			requirements: [
				{
					id: 'all-categories:reference-refresh',
					collection: 'categories',
					kind: 'refresh',
					priority: 700,
				},
			],
			represented: false,
		});
	});

	it.each([
		{
			collection: 'coupons',
			field: 'code',
			expected: {
				id: 'coupon-replay:coupons:reference-refresh',
				collection: 'coupons',
				kind: 'refresh',
				priority: 700,
			},
		},
		{
			collection: 'products/categories',
			field: 'name',
			expected: {
				id: 'coupon-replay:products/categories:reference-refresh',
				collection: 'categories',
				kind: 'refresh',
				priority: 700,
			},
		},
	] as const)('pins applied-coupon reference demand for $collection', (fixture) => {
		expect(
			compiledPlan(
				fixture.collection,
				{
					search: '',
					filters: {},
					sort: { field: fixture.field, direction: 'asc' },
				},
				{ id: `coupon-replay:${fixture.collection}` }
			)
		).toStrictEqual({ requirements: [fixture.expected], represented: false });
	});
});
