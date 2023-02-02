import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import { useObservableSuspense } from 'observable-hooks';
import { isRxDocument } from 'rxdb';

import { CurrentOrderContext } from './provider';
import { useStore } from '../../../../../../contexts/store/use-store';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export const useCurrentOrder = () => {
	if (CurrentOrderContext === undefined) {
		throw new Error(`useCurrentOrder must be called within CurrentOrderProvider`);
	}

	const { storeDB } = useStore();
	const { currentOrderResource } = React.useContext(CurrentOrderContext);
	const currentOrder = useObservableSuspense(currentOrderResource);
	const navigation = useNavigation();

	const addProduct = React.useCallback(
		async (product: ProductDocument) => {
			if (isRxDocument(currentOrder)) {
				// check if product is already in order
				const populatedLineItems = await currentOrder.populate('line_items');
				const existing = populatedLineItems.filter((li) => li.product_id === product.id);
				if (existing.length === 1) {
					await existing[0].update({
						$inc: {
							quantity: 1,
						},
					});
					return currentOrder;
				}
				return currentOrder.update({
					$push: {
						line_items: {
							product_id: product.id,
							name: product.name,
							quantity: 1,
							price: parseFloat(product.price || ''),
							sku: product.sku,
							tax_class: product.tax_class,
							meta_data: product.meta_data,
						},
					},
				});
			}
			const newOrder = storeDB?.collections.orders.insert({
				status: 'pos-open',
				line_items: [
					{
						product_id: product.id,
						name: product.name,
						quantity: 1,
						price: parseFloat(product.price || ''),
						sku: product.sku,
						tax_class: product.tax_class,
						meta_data: product.meta_data,
					},
				],
			});
			navigation.setParams({ orderID: newOrder?.uuid });
		},
		[currentOrder, navigation, storeDB?.collections.orders]
	);

	return {
		currentOrder,
		addProduct,
		addVariation: () => {},
	};
};
