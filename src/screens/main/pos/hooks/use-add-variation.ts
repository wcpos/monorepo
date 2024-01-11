import * as React from 'react';

import useSnackbar from '@wcpos/components/src/snackbar';

import { useAddItemToOrder } from './use-add-item-to-order';
import { priceToNumber } from './utils';
import { useT } from '../../../../contexts/translations';
import { useTaxHelpers } from '../../contexts/tax-helpers';

type ProductDocument = import('@wcpos/database').ProductDocument;
type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;
interface MetaData {
	key?: string;
	value?: string;
	attr_id: number;
	display_key?: string;
	display_value?: string;
}

export const useAddVariation = () => {
	const addSnackbar = useSnackbar();
	const { addItemToOrder } = useAddItemToOrder();
	const { pricesIncludeTax, calculateTaxesFromPrice } = useTaxHelpers();
	const t = useT();

	/**
	 *
	 */
	const addVariation = React.useCallback(
		async (variation: ProductVariationDocument, parent: ProductDocument, metaData?: MetaData[]) => {
			let priceWithoutTax = priceToNumber(variation.price);
			let attributes = metaData;

			const tax = calculateTaxesFromPrice({
				price: parseFloat(variation.price),
				taxClass: variation.tax_class,
				taxStatus: variation.tax_status,
				// pricesIncludeTax, // this is already set in the tax helper
			});

			let regularPriceWithoutTax = priceToNumber(variation.regular_price);
			const regularTax = calculateTaxesFromPrice({
				price: parseFloat(variation.regular_price),
				taxClass: variation.tax_class,
				taxStatus: variation.tax_status,
				// pricesIncludeTax, // this is already set in the tax helper
			});

			if (pricesIncludeTax) {
				priceWithoutTax = priceToNumber(variation.price) - tax.total;
				regularPriceWithoutTax = priceToNumber(variation.regular_price) - regularTax.total;
			}

			if (!attributes) {
				attributes = variation.attributes.map((attr) => ({
					key: attr.name,
					value: attr.option,
					attr_id: attr.id,
					display_key: attr.name,
					display_value: attr.option,
				}));
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
					...attributes,
					{ key: '_woocommerce_pos_tax_status', value: variation.tax_status },
				],
			};

			const success = addItemToOrder('line_items', newLineItem);

			if (success) {
				addSnackbar({
					message: t('{name} added to cart', { _tags: 'core', name: parent.name }),
					type: 'success',
				});
			}
		},
		[calculateTaxesFromPrice, pricesIncludeTax, addItemToOrder, addSnackbar, t]
	);

	return { addVariation };
};
