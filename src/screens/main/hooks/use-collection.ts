import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { filter } from 'rxjs/operators';

import { storeCollections } from '@wcpos/database';
import type { StoreDatabaseCollections } from '@wcpos/database';

import useLocalData from '../../../contexts/local-data/';

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
 */
const useCollection = <K extends CollectionKey>(
	key: K
): { collection: StoreDatabaseCollections[K] } => {
	const { storeDB } = useLocalData();
	const collection = useObservableState(
		storeDB.reset$.pipe(filter((collection) => collection.name === key)),
		storeDB.collections[key]
	);

	return { collection };
};

export default useCollection;
