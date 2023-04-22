import * as React from 'react';

import { useNavigation } from '@react-navigation/native';

import { priceToNumber, processNewOrder, processExistingOrder, addItem } from './helpers';
import useOrders from '../../../contexts/orders';
import useCollection from '../../../hooks/use-collection';

type OrderDocument = import('@wcpos/database').OrderDocument;
type ProductDocument = import('@wcpos/database').ProductDocument;

interface CurrentOrderContextProps {
	currentOrder: OrderDocument;
	addProduct: (product: ProductDocument) => Promise<void>;
	addVariation: (variation, parent, metaData) => Promise<void>;
	removeItem: (lineItem) => Promise<void>;
	removeCustomer: () => Promise<void>;
	addCustomer: (customer) => Promise<void>;
	addFee: (fee) => Promise<void>;
	addShipping: (shipping) => Promise<void>;
}

export const CurrentOrderContext = React.createContext<CurrentOrderContextProps>(null);

interface CurrentOrderContextProviderProps {
	children: React.ReactNode;
	orderID?: string;
}

/**
 * Providers the active order by uuid
 * If no orderID is provided, active order will be a new order (mock Order class)
 *
 * TODO - need a way to currency symbol from store document
 */
const CurrentOrderProvider = ({ children, orderID }: CurrentOrderContextProviderProps) => {
	const ordersCollection = useCollection('orders');
	const navigation = useNavigation();
	const { data: orders } = useOrders();
	let currentOrder = orders.find((order) => order.uuid === orderID);
	if (!currentOrder) {
		// last order is the new order
		currentOrder = orders[orders.length - 1];
	}

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
				// meta_data: filteredMetaData(product.meta_data),
			};

			const order = currentOrder.getLatest();

			if (order.isNew) {
				const newOrder = await processNewOrder(order, ordersCollection, {
					line_items: [newLineItem],
				});
				navigation.setParams({ orderID: newOrder?.uuid });
			} else {
				const populatedLineItems = await order.populate('line_items');
				const existing = populatedLineItems.filter((li) => li.product_id === product.id);
				await processExistingOrder(order, newLineItem, existing);
			}
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
				// meta_data: filteredMetaData(parent.meta_data).concat(metaData),
				meta_data: metaData,
			};

			const order = currentOrder.getLatest();

			if (order.isNew) {
				const newOrder = await processNewOrder(order, ordersCollection, {
					line_items: [newLineItem],
				});
				navigation.setParams({ orderID: newOrder?.uuid });
			} else {
				const populatedLineItems = await order.populate('line_items');
				const existing = populatedLineItems.filter((li) => li.variation_id === variation.id);
				await processExistingOrder(order, newLineItem, existing);
			}
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
		const order = currentOrder.getLatest();
		return order.patch({
			customer_id: -1,
			billing: {},
			shipping: {},
		});
	}, [currentOrder]);

	/**
	 *
	 */
	const addCustomer = React.useCallback(
		async (data) => {
			const order = currentOrder.getLatest();
			return order.patch(data);
		},
		[currentOrder]
	);

	/**
	 *
	 */
	const addFee = React.useCallback(
		async (data) => {
			const order = currentOrder.getLatest();

			if (order.isNew) {
				const newOrder = await processNewOrder(order, ordersCollection, { fee_lines: [data] });
				navigation.setParams({ orderID: newOrder?.uuid });
			} else {
				await addItem(order, { fee_lines: data });
			}
		},
		[currentOrder, navigation, ordersCollection]
	);

	/**
	 *
	 */
	const addShipping = React.useCallback(
		async (data) => {
			const order = currentOrder.getLatest();

			if (order.isNew) {
				const newOrder = await processNewOrder(order, ordersCollection, { shipping_lines: [data] });
				navigation.setParams({ orderID: newOrder?.uuid });
			} else {
				await addItem(order, { shipping_lines: data });
			}
		},
		[currentOrder, navigation, ordersCollection]
	);

	/**
	 *
	 */
	return (
		<CurrentOrderContext.Provider
			value={{
				currentOrder,
				addProduct,
				addVariation,
				removeItem,
				removeCustomer,
				addCustomer,
				addFee,
				addShipping,
			}}
		>
			{children}
		</CurrentOrderContext.Provider>
	);
};

export default CurrentOrderProvider;
