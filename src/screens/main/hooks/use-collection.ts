import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { filter, tap } from 'rxjs/operators';

import { storeCollections } from '@wcpos/database';
import type { StoreCollections } from '@wcpos/database';

import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';

export type CollectionKey = keyof typeof storeCollections;

/**
 * A helper method to get the latest collection, ie:
 * const { collection } = useCollection('products');
 *
 * Note: the reset$ will emit each time a collection is reset
 * This is a custom rxdb plugin
 *
 * This allows us to do a 'clear and sync' and update components
 * that are using the collection.
 *
 * @TODO - rxdb has a new RxCollection.onRemove hook that could be used to re-add the collection
 */
export const useCollection = <K extends CollectionKey>(
	key: K
): { collection: StoreCollections[K]; collectionLabel: string } => {
	const t = useT();
	const { storeDB } = useAppState();
	// const collection = storeDB.collections[key];

	/**
	 * @FIXME - The way collections and queries are handled needs to be rethought,
	 * it's not enough to just set the collection in state, we need to think about all the
	 * subscriptions and queries that are using the collection.
	 */
	const collection = useObservableState(
		storeDB.reset$.pipe(
			filter((collection) => collection.name === key)
			// /**
			//  * DebounceTime is a bit of a hack, we need to give useReplicationQuery
			//  * time to re-add both collections before we try to access them
			//  */
			// debounceTime(100)
		),
		storeDB.collections[key]
	);

	/**
	 *
	 */
	const collectionLabel = React.useMemo(() => {
		switch (key) {
			case 'products':
				return t('Product', { _tags: 'core' });
			case 'variations':
				return t('Variation', { _tags: 'core' });
			case 'customers':
				return t('Customer', { _tags: 'core' });
			case 'orders':
				return t('Order', { _tags: 'core' });
			case 'taxes':
				return t('Tax', { _tags: 'core' });
			case 'products/categories':
				return t('Category', { _tags: 'core' });
			case 'products/tags':
				return t('Tag', { _tags: 'core' });
			default:
				return t('Document', { _tags: 'core' });
		}
	}, [t, key]);

	return { collection, collectionLabel };
};
