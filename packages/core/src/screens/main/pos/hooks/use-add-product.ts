import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Toast } from '@wcpos/components/src/toast';
import { isRxDocument } from '@wcpos/database';
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
	const { addItemToOrder } = useAddItemToOrder();
	const { calculateLineItemTaxesAndTotals } = useCalculateLineItemTaxAndTotals();
	const { currentOrder } = useCurrentOrder();
	const { updateLineItem } = useUpdateLineItem();
	const t = useT();
	const { uiSettings } = useUISettings('pos-products');
	const metaDataKeys = useObservableEagerState(uiSettings.metaDataKeys$);

	/**
	 * Add product to order, or increment quantity if already in order
	 *
	 * NOTE: for the miscellaneous product we pass in an object!! Not a document
	 */
	const addProduct = React.useCallback(
		async (data: ProductDocument | { id: number; [key: string]: any }) => {
			let success;
			let product = data;

			// always make sure we have the latest product document
			if (isRxDocument(data)) {
				const latest = data.getLatest();
				product = latest.toMutableJSON();
			}

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
				Toast.show({
					type: 'success',
					text1: t('{name} added to cart', { _tags: 'core', name: product.name }),
				});
			} else {
				log.error('Error adding product to order', {
					product: product.id,
				});
				Toast.show({
					type: 'error',
					text1: t('Error adding {name} to cart', { _tags: 'core', name: product.name }),
				});
			}
		},
		[currentOrder, updateLineItem, metaDataKeys, calculateLineItemTaxesAndTotals, addItemToOrder, t]
	);

	return { addProduct };
};
