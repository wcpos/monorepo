import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { getLogger } from '@wcpos/utils/logger';
import type { EngineRecord } from '@wcpos/query';
import { wooIdOf } from '@wcpos/sync-core';

import { reportCartFailure } from './cart-failure';
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
import { useCurrentOrderActions } from '../contexts/current-order';

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
	// Event-time resolution — every variable product tile mounts this hook.
	const { getCurrentOrderRecord } = useCurrentOrderActions();
	const { incrementLineItem } = useUpdateLineItem();
	const t = useT();
	const { uiSettings } = useUISettings('pos-products');
	const metaDataKeys = useObservableEagerState(uiSettings.metaDataKeys$);
	const { calculateLineItemTaxesAndTotals } = useCalculateLineItemTaxAndTotals();

	/**
	 *
	 */
	const addVariation = React.useCallback(
		async (
			variationDoc: EngineRecord<'variations'>,
			parentDoc: EngineRecord<'products'>,
			metaData?: MetaData[],
			options?: { silent?: boolean }
		) => {
			let success;

			// always make sure we have the latest product document
			const variationRecord = variationDoc.getLatest();
			const parentRecord = parentDoc.getLatest();
			const variation = {
				...variationRecord.payload,
				id: variationRecord.remoteId === null ? 0 : wooIdOf(variationRecord.remoteId),
			} as ProductVariationDocument;
			const parent = {
				...parentRecord.payload,
				id: parentRecord.remoteId === null ? 0 : wooIdOf(parentRecord.remoteId),
			} as ProductDocument;
			const currentOrderRecord = getCurrentOrderRecord();
			const lineItems = currentOrderRecord.getLatest().payload.line_items ?? [];

			// check if variation is already in order, if so increment quantity
			if (!(currentOrderRecord as { isNew?: boolean }).isNew && parent.id !== 0) {
				const matches = findByProductVariationID(lineItems, parent.id ?? 0, variation.id);
				if (matches && matches.length === 1) {
					const uuid = getUuidFromLineItem(matches[0]);
					if (uuid) {
						success = await incrementLineItem(uuid, 1);
						if (success === false) return false;
					}
				}
			}

			// if variation is not in order, add it
			if (!success) {
				const keys = metaDataKeys ? metaDataKeys.split(',') : [];
				let newLineItem = convertVariationToLineItemWithoutTax(variation, parent, metaData, keys);
				newLineItem = calculateLineItemTaxesAndTotals(newLineItem);
				success = await addItemToOrder('line_items', newLineItem);
				if (success === false) return false;
			}

			// returned success should be the updated order
			if (success) {
				cartLogger.success(t('common.added_to_cart', { name: parent.name }), {
					// Scan-driven adds toast via the scan-feedback module instead.
					showToast: !options?.silent,
					context: {
						variationId: variation.id,
						productId: parent.id,
						productName: parent.name,
						orderId: currentOrderRecord.payload.id,
					},
				});
				return true;
			} else {
				reportCartFailure(cartLogger, 'Failed to add product to cart', {
					toastTitle: t('pos.error_adding_to_cart', { name: parent.name }),
					context: {
						variationId: variation.id,
						productId: parent.id,
						productName: parent.name,
						orderId: currentOrderRecord.payload.id,
					},
				});
				return false;
			}
		},
		[
			getCurrentOrderRecord,
			incrementLineItem,
			metaDataKeys,
			calculateLineItemTaxesAndTotals,
			addItemToOrder,
			t,
		]
	);

	return { addVariation };
};
