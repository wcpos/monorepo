import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import { set } from 'lodash';
import isEmpty from 'lodash/isEmpty';
import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import useSnackbar from '@wcpos/components/src/snackbar';

import { useAppState } from '../../../../../contexts/app-state';
import { t } from '../../../../../lib/translations';
import useCollection from '../../../hooks/use-collection';
import useTaxCalculation from '../../../hooks/use-tax-calculation';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
const addItem = async (currentOrder, $push) =>
	currentOrder.incrementalUpdate({
		$push,
	});

/**
 *
 */
const filteredMetaData = (metaData) => (metaData || []).filter((md) => !md.key.startsWith('_'));

/**
 *
 */
const priceToNumber = (price?: string) => parseFloat(isEmpty(price) ? '0' : price);

/**
 *
 */
const getDateCreated = () => {
	const date = new Date();
	const dateGmt = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
	const date_created = date.toISOString().split('.')[0];
	const date_created_gmt = dateGmt.toISOString().split('.')[0];
	return { date_created, date_created_gmt };
};

/**
 *
 */
const processNewOrder = async (order, ordersCollection, data) => {
	await order.remove();
	const newOrder = await ordersCollection.insert({
		...order.toJSON(),
		...getDateCreated(),
		...data,
	});
	return newOrder;
};

/**
 *
 */
const processExistingOrder = async (order, product, existing) => {
	if (existing.length === 1) {
		const item = existing[0];
		const current = item.getLatest();
		const currentQuantity = current.quantity;
		const currentSubtotal = current.subtotal;
		const currentTotal = current.total;
		const newValue = currentQuantity + 1;
		item.incrementalPatch({
			quantity: Number(newValue),
			subtotal: String((parseFloat(currentSubtotal) / currentQuantity) * Number(newValue)),
			total: String((parseFloat(currentTotal) / currentQuantity) * Number(newValue)),
		});
	} else {
		await addItem(order, { line_items: product });
	}
};

export const useCartHelpers = (currentOrder, setCurrentOrderID) => {
	const { collection } = useCollection('orders');
	const { store } = useAppState();
	const { calculateTaxesFromPrice } = useTaxCalculation('pos');
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
				setCurrentOrderID(newOrder?.uuid);
			} else {
				const populatedLineItems = await order.populate('line_items');
				const existing = populatedLineItems.filter((li) => li.product_id === product.id);
				await processExistingOrder(order, newLineItem, existing);
			}

			addSnackbar({
				message: t('{name} added to cart', { _tags: 'core', name: product.name }),
				type: 'success',
			});
		},
		[
			calculateTaxesFromPrice,
			pricesIncludeTax,
			currentOrder,
			addSnackbar,
			collection,
			setCurrentOrderID,
		]
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
				setCurrentOrderID(newOrder?.uuid);
			} else {
				const populatedLineItems = await order.populate('line_items');
				const existing = populatedLineItems.filter((li) => li.variation_id === variation.id);
				await processExistingOrder(order, newLineItem, existing);
			}

			addSnackbar({
				message: t('{name} added to cart', { _tags: 'core', name: parent.name }),
				type: 'success',
			});
		},
		[
			calculateTaxesFromPrice,
			pricesIncludeTax,
			currentOrder,
			addSnackbar,
			collection,
			setCurrentOrderID,
		]
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
				setCurrentOrderID(newOrder?.uuid);
			} else {
				await addItem(order, { fee_lines: newFeelLine });
			}
		},
		[calculateTaxesFromPrice, currentOrder, collection, setCurrentOrderID]
	);

	/**
	 *
	 */
	const addShipping = React.useCallback(
		async (data) => {
			const order = currentOrder.getLatest();

			if (order.isNew) {
				const newOrder = await processNewOrder(order, collection, { shipping_lines: [data] });
				setCurrentOrderID(newOrder?.uuid);
			} else {
				await addItem(order, { shipping_lines: data });
			}
		},
		[currentOrder, collection, setCurrentOrderID]
	);

	return { addProduct, addVariation, removeItem, removeCustomer, addCustomer, addFee, addShipping };
};
