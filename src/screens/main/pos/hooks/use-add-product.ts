import * as React from 'react';

import useSnackbar from '@wcpos/components/src/snackbar';

import { useAddItemToOrder } from './use-add-item-to-order';
import { priceToNumber } from './utils';
import { t } from '../../../../lib/translations';
import { useTaxHelpers } from '../../contexts/tax-helpers';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export const useAddProduct = () => {
	const addSnackbar = useSnackbar();
	const { addItemToOrder } = useAddItemToOrder();
	const { pricesIncludeTax, calculateTaxesFromPrice } = useTaxHelpers();

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
				// pricesIncludeTax, // this is already set in the tax helper
			});

			let regularPriceWithoutTax = priceToNumber(product.regular_price);
			const regularTax = calculateTaxesFromPrice({
				price: parseFloat(product.regular_price),
				taxClass: product.tax_class,
				taxStatus: product.tax_status,
				// pricesIncludeTax, // this is already set in the tax helper
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

			const success = await addItemToOrder('line_items', newLineItem);

			if (success) {
				addSnackbar({
					message: t('{name} added to cart', { _tags: 'core', name: product.name }),
					type: 'success',
				});
			}
		},
		[calculateTaxesFromPrice, pricesIncludeTax, addItemToOrder, addSnackbar]
	);

	return { addProduct };
};
