import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import useSnackbar from '@wcpos/components/src/snackbar';

import { priceToNumber, processNewOrder, processExistingOrder, addItem } from './helpers';
import useLocalData from '../../../../contexts/local-data';
import useCurrentOrder from '../../pos/contexts/current-order';
import useCollection from '../use-collection';
import useTaxCalculation from '../use-tax-calculation';

type ProductDocument = import('@wcpos/database').ProductDocument;

export const useCartHelpers = () => {
	const { collection } = useCollection('orders');
	const navigation = useNavigation();
	const { currentOrder } = useCurrentOrder();
	const { store } = useLocalData();
	const { calculateTaxesFromPrice } = useTaxCalculation();
	const pricesIncludeTax = useObservableState(
		store.prices_include_tax$.pipe(map((val) => val === 'yes')),
		store.prices_include_tax === 'yes'
	);
	const addSnackbar = useSnackbar();

	/**
	 * NOTE: once price, subtotal, total etc go into the cart they are always without tax
	 */
	const addProduct = React.useCallback(
		async (product: ProductDocument) => {
			let priceWithoutTax = priceToNumber(product.price);
			const tax = calculateTaxesFromPrice({
				price: parseFloat(product.price),
				taxClass: product.tax_class,
				taxStatus: product.tax_status,
				pricesIncludeTax,
			});

			let regularPriceWithoutTax = priceToNumber(product.regular_price);
			const regularTax = calculateTaxesFromPrice({
				price: parseFloat(product.regular_price),
				taxClass: product.tax_class,
				taxStatus: product.tax_status,
				pricesIncludeTax,
			});

			if (pricesIncludeTax) {
				priceWithoutTax = priceToNumber(product.price) - tax.total;
				regularPriceWithoutTax = priceToNumber(product.regular_price) - regularTax.total;
			}

			const newLineItem = {
				price: priceWithoutTax,
				subtotal: String(regularPriceWithoutTax),
				total: String(priceWithoutTax),
				subtotal_tax: tax.total,
				total_tax: tax.total,
				taxes: tax.taxes,
				product_id: product.id,
				name: product.name,
				quantity: 1,
				sku: product.sku,
				tax_class: product.tax_class,
				meta_data: [{ key: '_woocommerce_pos_tax_status', value: product.tax_status }],
				// meta_data: filteredMetaData(product.meta_data),
			};

			const order = currentOrder.getLatest();

			if (order.isNew) {
				const newOrder = await processNewOrder(order, collection, {
					line_items: [newLineItem],
				});
				navigation.setParams({ orderID: newOrder?.uuid });
			} else {
				const populatedLineItems = await order.populate('line_items');
				const existing = populatedLineItems.filter((li) => li.product_id === product.id);
				await processExistingOrder(order, newLineItem, existing);
			}

			addSnackbar({ message: `${product.name} added to cart`, type: 'success' });
		},
		[addSnackbar, calculateTaxesFromPrice, currentOrder, navigation, collection, pricesIncludeTax]
	);

	/**
	 *
	 */
	const addVariation = React.useCallback(
		async (variation, parent, metaData) => {
			let priceWithoutTax = priceToNumber(variation.price);
			const tax = calculateTaxesFromPrice({
				price: parseFloat(variation.price),
				taxClass: variation.tax_class,
				taxStatus: variation.tax_status,
				pricesIncludeTax,
			});

			let regularPriceWithoutTax = priceToNumber(variation.regular_price);
			const regularTax = calculateTaxesFromPrice({
				price: parseFloat(variation.regular_price),
				taxClass: variation.tax_class,
				taxStatus: variation.tax_status,
				pricesIncludeTax,
			});

			if (pricesIncludeTax) {
				priceWithoutTax = priceToNumber(variation.price) - tax.total;
				regularPriceWithoutTax = priceToNumber(variation.regular_price) - regularTax.total;
			}

			const newLineItem = {
				price: priceWithoutTax,
				subtotal: String(regularPriceWithoutTax),
				total: String(priceWithoutTax),
				subtotal_tax: tax.total,
				total_tax: tax.total,
				taxes: tax.taxes,
				product_id: parent.id,
				name: parent.name,
				variation_id: variation.id,
				quantity: 1,
				sku: variation.sku,
				tax_class: variation.tax_class,
				// meta_data: filteredMetaData(parent.meta_data).concat(metaData),
				meta_data: [
					...metaData,
					{ key: '_woocommerce_pos_tax_status', value: variation.tax_status },
				],
			};

			const order = currentOrder.getLatest();

			if (order.isNew) {
				const newOrder = await processNewOrder(order, collection, {
					line_items: [newLineItem],
				});
				navigation.setParams({ orderID: newOrder?.uuid });
			} else {
				const populatedLineItems = await order.populate('line_items');
				const existing = populatedLineItems.filter((li) => li.variation_id === variation.id);
				await processExistingOrder(order, newLineItem, existing);
			}

			addSnackbar({ message: `${parent.name} added to cart`, type: 'success' });
		},
		[addSnackbar, calculateTaxesFromPrice, currentOrder, navigation, collection, pricesIncludeTax]
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
			const tax = calculateTaxesFromPrice({
				price: parseFloat(data.total),
				taxClass: data.tax_class,
				taxStatus: data.tax_status,
				pricesIncludeTax: false,
			});

			const newFeelLine = {
				...data,
				total_tax: tax.total,
				taxes: tax.taxes,
			};

			const order = currentOrder.getLatest();

			if (order.isNew) {
				const newOrder = await processNewOrder(order, collection, {
					fee_lines: [newFeelLine],
				});
				navigation.setParams({ orderID: newOrder?.uuid });
			} else {
				await addItem(order, { fee_lines: newFeelLine });
			}
		},
		[calculateTaxesFromPrice, currentOrder, navigation, collection]
	);

	/**
	 *
	 */
	const addShipping = React.useCallback(
		async (data) => {
			const order = currentOrder.getLatest();

			if (order.isNew) {
				const newOrder = await processNewOrder(order, collection, { shipping_lines: [data] });
				navigation.setParams({ orderID: newOrder?.uuid });
			} else {
				await addItem(order, { shipping_lines: data });
			}
		},
		[currentOrder, navigation, collection]
	);

	return { addProduct, addVariation, removeItem, removeCustomer, addCustomer, addFee, addShipping };
};
