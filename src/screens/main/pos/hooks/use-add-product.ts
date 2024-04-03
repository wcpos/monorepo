import * as React from 'react';

import { isRxDocument } from 'rxdb';

import useSnackbar from '@wcpos/components/src/snackbar';
import log from '@wcpos/utils/src/logger';

import { useAddItemToOrder } from './use-add-item-to-order';
import { useUpdateLineItem } from './use-update-line-item';
import { priceToNumber, findByProductVariationID, getUuidFromLineItem } from './utils';
import { useT } from '../../../../contexts/translations';
import { useTaxRates } from '../../contexts/tax-rates';
import { useTaxCalculator } from '../../hooks/taxes/use-tax-calculator';
import { useCurrentOrder } from '../contexts/current-order';

type ProductDocument = import('@wcpos/database').ProductDocument;
type LineItem = import('@wcpos/database').OrderDocument['line_items'][number];

/**
 *
 */
export const useAddProduct = () => {
	const addSnackbar = useSnackbar();
	const { addItemToOrder } = useAddItemToOrder();
	const { pricesIncludeTax } = useTaxRates();
	const { calculateTaxesFromValue } = useTaxCalculator();
	const { currentOrder } = useCurrentOrder();
	const { updateLineItem } = useUpdateLineItem();
	const t = useT();

	/**
	 * Convert product document to line item schema
	 *
	 * NOTE: once price, subtotal, total etc go into the cart they are always without tax
	 */
	const convertProductToLineItem = React.useCallback(
		(product: ProductDocument): LineItem => {
			let priceWithoutTax = priceToNumber(product.price);
			const tax = calculateTaxesFromValue({
				value: product.price,
				taxClass: product.tax_class,
				taxStatus: product.tax_status,
			});

			let regularPriceWithoutTax = priceToNumber(product.regular_price);
			const regularTax = calculateTaxesFromValue({
				value: product.regular_price,
				taxClass: product.tax_class,
				taxStatus: product.tax_status,
			});

			if (pricesIncludeTax) {
				priceWithoutTax = priceToNumber(product.price) - tax.total;
				regularPriceWithoutTax = priceToNumber(product.regular_price) - regularTax.total;
			}

			return {
				price: priceWithoutTax,
				subtotal: String(regularPriceWithoutTax),
				total: String(priceWithoutTax),
				subtotal_tax: String(tax.total),
				total_tax: String(tax.total),
				taxes: tax.taxes,
				product_id: product.id,
				name: product.name,
				quantity: 1,
				sku: product.sku,
				tax_class: product.tax_class,
				meta_data: [{ key: '_woocommerce_pos_tax_status', value: product.tax_status }],
				// meta_data: filteredMetaData(product.meta_data),
			};
		},
		[calculateTaxesFromValue, pricesIncludeTax]
	);

	/**
	 * Add product to order, or increment quantity if already in order
	 */
	const addProduct = React.useCallback(
		async (product: ProductDocument) => {
			let success;

			// check if product is already in order, if so increment quantity
			if (!currentOrder.isNew && product.id !== 0) {
				const lineItems = currentOrder.getLatest().line_items ?? [];
				const matches = findByProductVariationID(lineItems, product.id);
				if (matches.length === 1) {
					const uuid = getUuidFromLineItem(matches[0]);
					if (uuid) {
						success = await updateLineItem(uuid, { quantity: matches[0].quantity + 1 });
					}
				}
			}

			// if product is not in order, add it
			if (!success) {
				const newLineItem = convertProductToLineItem(product);
				success = await addItemToOrder('line_items', newLineItem);
			}

			// returned success should be the updated order
			if (isRxDocument(success)) {
				addSnackbar({
					message: t('{name} added to cart', { _tags: 'core', name: product.name }),
					type: 'success',
				});
			} else {
				log.error('Error adding product to order', {
					product: product.id,
				});
				addSnackbar({
					message: t('Error adding {name} to cart', { _tags: 'core', name: product.name }),
					type: 'error',
				});
			}
		},
		[currentOrder, convertProductToLineItem, addItemToOrder, updateLineItem, addSnackbar, t]
	);

	return { addProduct };
};
