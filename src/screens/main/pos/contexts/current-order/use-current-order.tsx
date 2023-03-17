import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import isEmpty from 'lodash/isEmpty';
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { BehaviorSubject } from 'rxjs';

import { CurrentOrderContext } from './provider';
import useLocalData from '../../../../../contexts/local-data';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 * Helpers
 */
const addItem = async (currentOrder, $push) =>
	currentOrder.incrementalUpdate({
		$push,
	});

const increaseQuantity = async (lineItem) =>
	lineItem.incrementalUpdate({
		$inc: {
			quantity: 1,
		},
	});

// filter meta data starting with underscore
const filteredMetaData = (metaData) => (metaData || []).filter((md) => !md.key.startsWith('_'));

// price string to number
const priceToNumber = (price?: string) => parseFloat(isEmpty(price) ? '0' : price);

/**
 *
 */
export const useCurrentOrder = () => {
	if (CurrentOrderContext === undefined) {
		throw new Error(`useCurrentOrder must be called within CurrentOrderProvider`);
	}

	const { storeDB } = useLocalData();
	const ordersCollection = storeDB?.collections.orders;
	const { currentOrderResource } = React.useContext(CurrentOrderContext);
	const currentOrder = useObservableSuspense(currentOrderResource);
	const navigation = useNavigation();

	/**
	 *
	 */
	const addProduct = React.useCallback(
		async (product: ProductDocument) => {
			const newLineItem = {
				product_id: product.id,
				name: product.name,
				quantity: 1,
				price: priceToNumber(product.price),
				sku: product.sku,
				tax_class: product.tax_class,
				meta_data: filteredMetaData(product.meta_data),
			};

			if (isRxDocument(currentOrder)) {
				const order = currentOrder.getLatest();
				// check if product is already in order
				const populatedLineItems = await order.populate('line_items');
				const existing = populatedLineItems.filter((li) => li.product_id === product.id);
				if (existing.length === 1) {
					await increaseQuantity(existing[0]);
					return order;
				}
				return addItem(order, { line_items: newLineItem });
			}
			const newOrder = await ordersCollection.insert({
				...currentOrder.toJSON(),
				line_items: [newLineItem],
			});
			navigation.setParams({ orderID: newOrder?.uuid });
		},
		[currentOrder, navigation, ordersCollection]
	);

	/**
	 *
	 */
	const addVariation = React.useCallback(
		async (variation, parent, metaData) => {
			const newLineItem = {
				product_id: parent.id,
				name: parent.name,
				variation_id: variation.id,
				quantity: 1,
				price: priceToNumber(variation.price),
				sku: variation.sku,
				tax_class: variation.tax_class,
				meta_data: filteredMetaData(parent.meta_data).concat(metaData),
			};

			if (isRxDocument(currentOrder)) {
				const order = currentOrder.getLatest();
				const populatedLineItems = await order.populate('line_items');
				const existing = populatedLineItems.filter((li) => li.variation_id === variation.id);
				if (existing.length === 1) {
					await increaseQuantity(existing[0]);
					return order;
				}
				return addItem(order, { line_items: newLineItem });
			}
			const newOrder = await ordersCollection.insert({
				...currentOrder.toJSON(),
				line_items: [newLineItem],
			});
			navigation.setParams({ orderID: newOrder?.uuid });
		},
		[currentOrder, navigation, ordersCollection]
	);

	/**
	 * TODO - remove this, children uuids need to stay on the parent until sync is completed
	 */
	const removeItem = React.useCallback(
		async (item) => {
			const order = currentOrder.getLatest();
			const collection = item.collection.name;
			await order.update({
				$pullAll: {
					[collection]: [item.uuid],
				},
			});
			return item.incrementalRemove();
		},
		[currentOrder]
	);

	/**
	 *
	 */
	const removeCustomer = React.useCallback(async () => {
		if (isRxDocument(currentOrder)) {
			const order = currentOrder.getLatest();
			return order.patch({
				customer_id: -1,
				billing: {},
				shipping: {},
			});
		}
		currentOrder.customer_id$.next(-1);
	}, [currentOrder]);

	/**
	 *
	 */
	const addCustomer = React.useCallback(
		async (data) => {
			if (isRxDocument(currentOrder)) {
				const order = currentOrder.getLatest();
				return order.patch(data);
			}
			currentOrder.customer_id = data.customer_id;
			currentOrder.billing = data.billing;
			currentOrder.shipping = data.shipping;
			currentOrder.customer_id$.next(data.customer_id);
		},
		[currentOrder]
	);

	/**
	 *
	 */
	const addFee = React.useCallback(
		async (data) => {
			if (isRxDocument(currentOrder)) {
				const order = currentOrder.getLatest();
				return addItem(order, { fee_lines: data });
			}
			const newOrder = await ordersCollection.insert({
				...currentOrder.toJSON(),
				fee_lines: [data],
			});
			navigation.setParams({ orderID: newOrder?.uuid });
		},
		[currentOrder, navigation, ordersCollection]
	);

	/**
	 *
	 */
	const addShipping = React.useCallback(
		async (data) => {
			if (isRxDocument(currentOrder)) {
				const order = currentOrder.getLatest();
				return addItem(order, { shipping_lines: data });
			}
			const newOrder = await ordersCollection.insert({
				...currentOrder.toJSON(),
				shipping_lines: [data],
			});
			navigation.setParams({ orderID: newOrder?.uuid });
		},
		[currentOrder, navigation, ordersCollection]
	);

	return {
		currentOrder,
		addProduct,
		addVariation,
		removeItem,
		removeCustomer,
		addCustomer,
		addFee,
		addShipping,
	};
};
