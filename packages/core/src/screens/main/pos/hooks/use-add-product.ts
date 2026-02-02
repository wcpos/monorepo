import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { isRxDocument } from '@wcpos/database';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useAddItemToOrder } from './use-add-item-to-order';
import { useCalculateLineItemTaxAndTotals } from './use-calculate-line-item-tax-and-totals';
import { useUpdateLineItem } from './use-update-line-item';
import {
	convertProductToLineItemWithoutTax,
	findByProductVariationID,
	getUuidFromLineItem,
} from './utils';
import { useT } from '../../../../contexts/translations';
import { useUISettings } from '../../contexts/ui-settings';
import { useCurrentOrder } from '../contexts/current-order';

const cartLogger = getLogger(['wcpos', 'pos', 'cart']);

type ProductDocument = import('@wcpos/database').ProductDocument;

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

	// Create order-specific logger
	const orderLogger = React.useMemo(
		() =>
			cartLogger.with({
				orderUUID: currentOrder.uuid,
				orderID: currentOrder.id,
				orderNumber: currentOrder.number,
			}),
		[currentOrder.uuid, currentOrder.id, currentOrder.number]
	);

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
				orderLogger.success(t('{name} added to cart', {name: product.name }), {
					showToast: true,
					saveToDb: true,
					context: {
						productId: product.id,
						productName: product.name,
					},
				});
			} else {
				orderLogger.error(t('Error adding {name} to cart', {name: product.name }), {
					showToast: true,
					saveToDb: true,
					context: {
						errorCode: ERROR_CODES.TRANSACTION_FAILED,
						productId: product.id,
						productName: product.name,
					},
				});
			}
		},
		[
			currentOrder,
			updateLineItem,
			metaDataKeys,
			calculateLineItemTaxesAndTotals,
			addItemToOrder,
			t,
			orderLogger,
		]
	);

	return { addProduct };
};
