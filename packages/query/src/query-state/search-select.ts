import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { acquireEngineQueryHandle } from './query-handles';
import { compileQuery } from './query-state-translator';

import type { EngineQueryDescriptor } from '../engine-query';
import type { LegacyCollectionName } from '../engine-adapter/collection-map';
import type { QueryHandle } from '../query-handle';

type CompiledQuery = ReturnType<typeof compileQuery>;

export type SearchSelectCollection =
	'customer' | 'category' | 'brand' | 'tag' | 'cashier' | 'coupon';

export const SEARCH_SELECT_COLLECTIONS: Record<SearchSelectCollection, LegacyCollectionName> = {
	customer: 'customers',
	cashier: 'customers',
	category: 'products/categories',
	brand: 'products/brands',
	tag: 'products/tags',
	coupon: 'coupons',
};

function searchSelectDescriptor(
	collection: SearchSelectCollection,
	search: string,
	limit: number
): EngineQueryDescriptor {
	const isCustomer = collection === 'customer' || collection === 'cashier';
	return {
		collection: SEARCH_SELECT_COLLECTIONS[collection],
		selector:
			collection === 'cashier'
				? { role: { $in: ['administrator', 'shop_manager', 'cashier'] } }
				: {},
		sort: [
			{
				[isCustomer ? 'last_name' : collection === 'coupon' ? 'code' : 'name']: 'asc',
			},
		],
		limit,
		search,
	};
}

/** The picker's demand: the collection's sort, the cashier role filter left residual. */
function compileSearchSelect(
	collection: SearchSelectCollection,
	search: string,
	limit: number,
	id: string
): CompiledQuery {
	const common = { search, filters: {}, limit } as const;
	switch (collection) {
		case 'customer':
		case 'cashier':
			return compileQuery(
				'customers',
				{ ...common, sort: { field: 'last_name', direction: 'asc' } },
				{ id, residual: collection === 'cashier' }
			);
		case 'category':
			return compileQuery(
				'products/categories',
				{ ...common, sort: { field: 'name', direction: 'asc' } },
				{ id }
			);
		case 'brand':
			return compileQuery(
				'products/brands',
				{ ...common, sort: { field: 'name', direction: 'asc' } },
				{ id }
			);
		case 'tag':
			return compileQuery(
				'products/tags',
				{ ...common, sort: { field: 'name', direction: 'asc' } },
				{ id }
			);
		case 'coupon':
			return compileQuery(
				'coupons',
				{ ...common, sort: { field: 'code', direction: 'asc' } },
				{ id }
			);
	}
}

/** Acquire the picker's read and compiled demand under its caller-owned key. */
export function acquireSearchSelectHandle(
	engine: RxdbSyncEngine,
	key: string,
	{
		collection,
		search,
		limit,
		searchFields,
	}: {
		collection: SearchSelectCollection;
		search: string;
		limit: number;
		searchFields?: string[];
	}
): QueryHandle {
	return acquireEngineQueryHandle(engine, key, (id) => ({
		descriptor: { ...searchSelectDescriptor(collection, search, limit), searchFields },
		compiled: compileSearchSelect(collection, search, limit, id),
	}));
}
