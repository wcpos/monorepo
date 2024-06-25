import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import useSnackbar from '@wcpos/components/src/snackbar';
import log from '@wcpos/utils/src/logger';

import { useAddItemToOrder } from './use-add-item-to-order';
import { useCalculateLineItemTaxAndTotals } from './use-calculate-line-item-tax-and-totals';
import { useUpdateLineItem } from './use-update-line-item';
import {
	findByProductVariationID,
	getUuidFromLineItem,
	convertProductToLineItemWithoutTax,
} from './utils';
import { useT } from '../../../../contexts/translations';
import { useUISettings } from '../../contexts/ui-settings';
import { useCurrentOrder } from '../contexts/current-order';

type ProductDocument = import('@wcpos/database').ProductDocument;
type LineItem = import('@wcpos/database').OrderDocument['line_items'][number];

/**
 *
 */
export const useAddProduct = () => {
	const addSnackbar = useSnackbar();
	const { addItemToOrder } = useAddItemToOrder();
	const { calculateLineItemTaxesAndTotals } = useCalculateLineItemTaxAndTotals();
	const { currentOrder } = useCurrentOrder();
	const { updateLineItem } = useUpdateLineItem();
	const t = useT();
	const { uiSettings } = useUISettings('pos-products');
	const metaDataKeys = useObservableEagerState(uiSettings.metaDataKeys$);

	/**
	 * Add product to order, or increment quantity if already in order
	 */
	const addProduct = React.useCallback(
		async (productDoc: ProductDocument) => {
			let success;

			// always make sure we have the latest product document
			const product = productDoc.getLatest();

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
				const keys = metaDataKeys ? metaDataKeys.split(',') : [];
				let newLineItem = convertProductToLineItemWithoutTax(product, keys);
				newLineItem = calculateLineItemTaxesAndTotals(newLineItem);
				success = await addItemToOrder('line_items', newLineItem);
			}

			// returned success should be the updated order
			if (success) {
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
		[
			currentOrder,
			updateLineItem,
			metaDataKeys,
			calculateLineItemTaxesAndTotals,
			addItemToOrder,
			addSnackbar,
			t,
		]
	);

	return { addProduct };
};
