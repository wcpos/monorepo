import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import log from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useAddItemToOrder } from './use-add-item-to-order';
import { useCalculateLineItemTaxAndTotals } from './use-calculate-line-item-tax-and-totals';
import { useUpdateLineItem } from './use-update-line-item';
import {
	convertVariationToLineItemWithoutTax,
	findByProductVariationID,
	getUuidFromLineItem,
} from './utils';
import { useT } from '../../../../contexts/translations';
import { useUISettings } from '../../contexts/ui-settings';
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
	const { addItemToOrder } = useAddItemToOrder();
	const { currentOrder } = useCurrentOrder();
	const { updateLineItem } = useUpdateLineItem();
	const t = useT();
	const { uiSettings } = useUISettings('pos-products');
	const metaDataKeys = useObservableEagerState(uiSettings.metaDataKeys$);
	const { calculateLineItemTaxesAndTotals } = useCalculateLineItemTaxAndTotals();

	/**
	 *
	 */
	const addVariation = React.useCallback(
		async (
			variationDoc: ProductVariationDocument,
			parentDoc: ProductDocument,
			metaData?: MetaData[]
		) => {
			let success;

			// always make sure we have the latest product document
			const variation = variationDoc.getLatest();
			const parent = parentDoc.getLatest();

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
				const keys = metaDataKeys ? metaDataKeys.split(',') : [];
				let newLineItem = convertVariationToLineItemWithoutTax(variation, parent, metaData, keys);
				newLineItem = calculateLineItemTaxesAndTotals(newLineItem);
				success = await addItemToOrder('line_items', newLineItem);
			}

		// returned success should be the updated order
		if (success) {
			log.success(t('{name} added to cart', { _tags: 'core', name: parent.name }), {
				showToast: true,
				saveToDb: true,
				context: {
					variationId: variation.id,
					productId: parent.id,
					productName: parent.name,
					orderId: currentOrder.id,
				},
			});
		} else {
			log.error(t('Error adding {name} to cart', { _tags: 'core', name: parent.name }), {
				showToast: true,
				saveToDb: true,
				context: {
					errorCode: ERROR_CODES.TRANSACTION_FAILED,
					variationId: variation.id,
					productId: parent.id,
					productName: parent.name,
					orderId: currentOrder.id,
				},
			});
		}
		},
		[currentOrder, updateLineItem, metaDataKeys, calculateLineItemTaxesAndTotals, addItemToOrder, t]
	);

	return { addVariation };
};
