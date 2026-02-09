import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { filter } from 'rxjs/operators';

import { storeCollections } from '@wcpos/database';
import type { StoreCollections } from '@wcpos/database';

import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';

export type CollectionKey = keyof typeof storeCollections;

/**
 * Hook to get a collection reference that auto-updates when the collection is reset.
 *
 * @example
 * const { collection } = useCollection('products');
 *
 * How it works:
 * - Returns the current collection from storeDB
 * - Subscribes to `storeDB.reset$` (from reset-collection plugin)
 * - When collection is reset (via swapCollection or direct remove),
 *   this hook automatically receives the new collection reference
 *
 * Collection reset flow:
 * 1. swapCollection() cancels all queries/replications for the collection
 * 2. collection.remove() is called (instant, regardless of record count)
 * 3. reset-collection plugin re-creates the collection and emits on reset$
 * 4. This hook receives the new collection and triggers re-render
 * 5. useQuery/useRelationalQuery hooks also subscribe to reset$ and re-register
 */
export const useCollection = <K extends CollectionKey>(
	key: K
): { collection: StoreCollections[K]; collectionLabel: string } => {
	const t = useT();
	const { storeDB } = useAppState();

	/**
	 * Subscribe to reset$ to get the new collection reference when reset.
	 * Initial value is the current collection from storeDB.
	 */
	const collection = useObservableState(
		storeDB.reset$.pipe(filter((collection: { name: string }) => collection.name === key)),
		storeDB.collections[key]
	) as StoreCollections[K];

	/**
	 *
	 */
	const collectionLabel = React.useMemo(() => {
		switch (key) {
			case 'products':
				return t('common.product');
			case 'variations':
				return t('common.variation');
			case 'customers':
				return t('common.customer');
			case 'orders':
				return t('common.order');
			case 'taxes':
				return t('common.tax');
			case 'products/categories':
				return t('common.category');
			case 'products/tags':
				return t('common.tag');
			case 'logs':
				return t('common.log');
			default:
				return t('common.document');
		}
	}, [t, key]);

	return { collection, collectionLabel };
};
