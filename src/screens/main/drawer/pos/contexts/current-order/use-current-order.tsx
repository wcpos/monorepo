import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import { useObservableSuspense } from 'observable-hooks';
import { isRxDocument } from 'rxdb';

import { CurrentOrderContext } from './provider';
import { useStore } from '../../../../../../contexts/store/use-store';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 * Helpers
 */
const createNewOrder = async (ordersCollection, data) =>
	ordersCollection.insert({
		status: 'pos-open',
		...data,
	});

const addItem = async (currentOrder, $push) =>
	currentOrder.update({
		$push,
	});

const increaseQuantity = async (lineItem) =>
	lineItem.update({
		$inc: {
			quantity: 1,
		},
	});

// filter meta data starting with underscore
const filteredMetaData = (metaData) => (metaData || []).filter((md) => !md.key.startsWith('_'));

/**
 *
 */
export const useCurrentOrder = () => {
	if (CurrentOrderContext === undefined) {
		throw new Error(`useCurrentOrder must be called within CurrentOrderProvider`);
	}

	const { storeDB } = useStore();
	const ordersCollection = storeDB?.collections.orders;
	const { currentOrderResource } = React.useContext(CurrentOrderContext);
	const currentOrder = useObservableSuspense(currentOrderResource);
	const navigation = useNavigation();

	const addProduct = React.useCallback(
		async (product: ProductDocument) => {
			const newLineItem = {
				product_id: product.id,
				name: product.name,
				quantity: 1,
				price: parseFloat(product.price || ''),
				sku: product.sku,
				tax_class: product.tax_class,
				meta_data: filteredMetaData(product.meta_data),
			};

			if (isRxDocument(currentOrder)) {
				// check if product is already in order
				const populatedLineItems = await currentOrder.populate('line_items');
				const existing = populatedLineItems.filter((li) => li.product_id === product.id);
				if (existing.length === 1) {
					await increaseQuantity(existing[0]);
					return currentOrder;
				}
				return addItem(currentOrder, { line_items: newLineItem });
			}
			const newOrder = await createNewOrder(ordersCollection, { line_items: [newLineItem] });
			navigation.setParams({ orderID: newOrder?.uuid });
		},
		[currentOrder, navigation, ordersCollection]
	);

	const addVariation = React.useCallback(
		async (variation, parent, metaData) => {
			const newLineItem = {
				product_id: parent.id,
				name: parent.name,
				variation_id: variation.id,
				quantity: 1,
				price: parseFloat(variation.price || ''),
				sku: variation.sku,
				tax_class: variation.tax_class,
				meta_data: filteredMetaData(parent.meta_data).concat(metaData),
			};

			if (isRxDocument(currentOrder)) {
				const populatedLineItems = await currentOrder.populate('line_items');
				const existing = populatedLineItems.filter((li) => li.variation_id === variation.id);
				if (existing.length === 1) {
					await increaseQuantity(existing[0]);
					return currentOrder;
				}
				return addItem(currentOrder, { line_items: newLineItem });
			}
			const newOrder = await createNewOrder(ordersCollection, { line_items: [newLineItem] });
			navigation.setParams({ orderID: newOrder?.uuid });
		},
		[currentOrder, navigation, ordersCollection]
	);

	const removeItem = React.useCallback(
		async (item) => {
			const collection = item.collection.name;
			await currentOrder.update({
				$pullAll: {
					[collection]: [item.uuid],
				},
			});
			return item.remove();
		},
		[currentOrder]
	);

	return {
		currentOrder,
		addProduct,
		addVariation,
		removeItem,
	};
};
