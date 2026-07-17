import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useAddItemToOrder } from './use-add-item-to-order';
import { useCalculateLineItemTaxAndTotals } from './use-calculate-line-item-tax-and-totals';
import { useCartStockGuard } from './use-cart-stock-guard';
import { useUpdateLineItem } from './use-update-line-item';
import {
	convertVariationToLineItemWithoutTax,
	findByProductVariationID,
	getUuidFromLineItem,
} from './utils';
import { useT } from '../../../../contexts/translations';
import { useUISettings } from '../../contexts/ui-settings';
import { useCurrentOrder } from '../contexts/current-order';

const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'variation']);

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
	const { stockGuardEnabled, checkCartStock, showBackorderWarning } = useCartStockGuard();

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
			let updatedExistingLine = false;

			// always make sure we have the latest product document
			const variation = variationDoc.getLatest();
			const parent = parentDoc.getLatest();
			const lineItems = currentOrder.getLatest().line_items ?? [];
			const stockResult =
				stockGuardEnabled && (parent.id ?? 0) !== 0
					? await checkCartStock({
							lineItems,
							productId: parent.id ?? 0,
							variationId: variation.id,
							requestedQuantity: 1,
							product: parent,
							variation,
							name: parent.name,
						})
					: { allowed: true, warning: null, available: null, name: parent.name ?? '' };
			if (!stockResult.allowed) return false;

			// check if variation is already in order, if so increment quantity
			if (!(currentOrder as unknown as { isNew?: boolean }).isNew && parent.id !== 0) {
				const matches = findByProductVariationID(lineItems, parent.id ?? 0, variation.id);
				if (matches && matches.length === 1) {
					const uuid = getUuidFromLineItem(matches[0]);
					if (uuid) {
						success = await updateLineItem(
							uuid,
							{ quantity: (matches[0].quantity ?? 0) + 1 },
							{ skipStockGuard: true }
						);
						updatedExistingLine = Boolean(success);
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

			if (updatedExistingLine && stockResult.warning === 'backorder') {
				showBackorderWarning(stockResult.name);
			}

			// returned success should be the updated order
			if (success) {
				cartLogger.success(t('common.added_to_cart', { name: parent.name }), {
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
				cartLogger.error(t('pos.error_adding_to_cart', { name: parent.name }), {
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

			return Boolean(success);
		},
		[
			currentOrder,
			updateLineItem,
			metaDataKeys,
			calculateLineItemTaxesAndTotals,
			addItemToOrder,
			checkCartStock,
			showBackorderWarning,
			stockGuardEnabled,
			t,
		]
	);

	return { addVariation };
};
