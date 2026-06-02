import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import { collectMetaKeys, type MetaProduct } from './meta-keys';
import { useCollection } from '../../hooks/use-collection';

/**
 * Discover product meta keys from products synced to this device.
 *
 * Local-only: covers products already replicated into RxDB. Subscribes to the
 * products query observable (rather than a one-shot effect) so the suggestion
 * list stays current as products sync in and survives collection resets.
 */
export function useProductMetaKeys(): string[] {
	const { collection } = useCollection('products');
	const query = React.useMemo(
		() => collection.find({ selector: { meta_data: { $elemMatch: { key: { $exists: true } } } } }),
		[collection]
	);
	const products = useObservableState(query.$, []) as MetaProduct[];

	return React.useMemo(() => collectMetaKeys(products), [products]);
}
