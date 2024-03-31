import * as React from 'react';

import { isRxDocument } from 'rxdb';

import useSnackbar from '@wcpos/components/src/snackbar';
import log from '@wcpos/utils/src/logger';

import { useAddItemToOrder } from './use-add-item-to-order';
import { useUpdateLineItem } from './use-update-line-item';
import { priceToNumber, findByProductVariationID, getUuidFromLineItem } from './utils';
import { useT } from '../../../../contexts/translations';
import { useTaxHelpers } from '../../contexts/tax-helpers';
import { useCurrentOrder } from '../contexts/current-order';

type LineItem = import('@wcpos/database').OrderDocument['line_items'][number];
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
	const { currentOrder } = useCurrentOrder();
	const { updateLineItem } = useUpdateLineItem();
	const t = useT();

	/**
	 * Convert variations document to line item schema
	 */
	const convertVariationToLineItem = React.useCallback(
		(
			variation: ProductVariationDocument,
			parent: ProductDocument,
			metaData?: MetaData[]
		): LineItem => {
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

			return {
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
		},
		[calculateTaxesFromPrice, pricesIncludeTax]
	);

	/**
	 *
	 */
	const addVariation = React.useCallback(
		async (variation: ProductVariationDocument, parent: ProductDocument, metaData?: MetaData[]) => {
			let success;

			// check if variation is already in order, if so increment quantity
			if (!currentOrder.isNew && parent.id !== 0) {
				const lineItems = currentOrder.getLatest().line_items ?? [];
				const matches = findByProductVariationID(lineItems, parent.id, variation.id);
				if (matches.length === 1) {
					const uuid = getUuidFromLineItem(matches[0]);
					if (uuid) {
						success = await updateLineItem(uuid, { quantity: matches[0].quantity + 1 });
					}
				}
			}

			// if variation is not in order, add it
			if (!success) {
				const newLineItem = convertVariationToLineItem(variation, parent, metaData);
				success = await addItemToOrder('line_items', newLineItem);
			}

			// returned success should be the updated order

			if (isRxDocument(success)) {
				addSnackbar({
					message: t('{name} added to cart', { _tags: 'core', name: parent.name }),
					type: 'success',
				});
			} else {
				log.error('Error adding variation to order', {
					variation: variation.id,
					parent: parent.id,
					metaData,
				});
				addSnackbar({
					message: t('Error adding {name} to cart', { _tags: 'core', name: parent.name }),
					type: 'critical',
				});
			}
		},
		[currentOrder, updateLineItem, convertVariationToLineItem, addItemToOrder, addSnackbar, t]
	);

	return { addVariation };
};
