import * as React from 'react';

import { useAppState } from '../../../contexts/app-state';

import type { CollectionKey } from './use-collection';

/**
 *
 */
export const useCollectionReset = (key: CollectionKey) => {
	const { storeDB, fastStoreDB } = useAppState();

	/**
	 * Special case for products, we need to remove the variations collection first
	 */
	const clear = React.useCallback(async () => {
		if (key === 'products') {
			await fastStoreDB.collections['variations'].remove();
			await storeDB.collections['variations'].remove();
		}
		await fastStoreDB.collections[key].remove();
		await storeDB.collections[key].remove();
	}, [fastStoreDB, key, storeDB]);

	return { clear };
};
