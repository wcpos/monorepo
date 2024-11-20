import * as React from 'react';

import { useQueryManager, CollectionReplicationState } from '@wcpos/query';

import { useCollection } from './use-collection';

type LineItems = import('@wcpos/database').OrderDocument['line_items'];

/**
 *
 */
export const useStockAdjustment = () => {
	const { collection: productsCollection } = useCollection('products');
	const { collection: variationsCollection } = useCollection('variations');
	const manager = useQueryManager();

	/**
	 *
	 */
	const productsReplicationState = manager.registerCollectionReplication({
		collection: productsCollection,
		endpoint: 'products',
	}) as CollectionReplicationState<typeof productsCollection>;

	/**
	 * Variations could be from any parent, so we need to use the generic endpoint
	 */
	const variationsReplicationState = manager.registerCollectionReplication({
		collection: variationsCollection,
		endpoint: 'products/variations',
	}) as CollectionReplicationState<typeof variationsCollection>;

	/**
	 * Helper function to fetch updated products and variations
	 */
	const stockAdjustment = React.useCallback(
		(lineItems: LineItems) => {
			if (Array.isArray(lineItems) && lineItems.length > 0) {
				const productIds = lineItems
					.filter((product) => product.variation_id === 0)
					.map((product) => product.product_id);
				const variationIds = lineItems
					.filter((product) => product.variation_id !== 0)
					.map((product) => product.variation_id);

				/**
				 * @TODO - this needs to be greedy if array.length > 10
				 */
				try {
					productsReplicationState.sync({ include: productIds, force: true, greedy: true });
					variationsReplicationState.sync({ include: variationIds, force: true, greedy: true });
				} catch (error) {
					console.error(error);
				}
			}
		},
		[productsReplicationState, variationsReplicationState]
	);

	return { stockAdjustment };
};
