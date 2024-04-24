import * as React from 'react';

import { useAppState } from '../../../contexts/app-state';

import type { CollectionKey } from './use-collection';

/**
 * Reset collection map
 * - Some collections are linked, so we need to reset them all
 */
const resetCollectionNames = {
	products: ['variations', 'products'],
};

/**
 *
 */
export const useCollectionReset = (key: CollectionKey) => {
	const { storeDB } = useAppState();

	/**
	 *
	 */
	const clear = React.useCallback(() => {
		const keys = resetCollectionNames[key] || [key];
		storeDB.reset(keys);
	}, [storeDB, key]);

	return { clear };
};
