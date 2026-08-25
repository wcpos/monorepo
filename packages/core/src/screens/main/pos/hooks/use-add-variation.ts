import * as React from 'react';

import { calculateCartLine } from '@wcpos/order-math';
import { getLogger } from '@wcpos/utils/logger';
import type { EngineRecord } from '@wcpos/query';
import { wooIdOf } from '@wcpos/sync-core';
import { useDocField } from '@wcpos/query';

import { reportCartFailure } from './cart-failure';
import { useAddItemToOrder } from './use-add-item-to-order';
import { useCartConfig } from './use-cart-config';
import { useUpdateLineItem } from './use-update-line-item';
import {
	convertVariationToLineItemWithoutTax,
	findByProductVariationID,
	getUuidFromLineItem,
} from './utils';
import { useT } from '../../../../contexts/translations';
import { useUISettings } from '../../contexts/ui-settings';
import { useCurrentOrderActions } from '../contexts/current-order';
import { useReportEngineWarnings } from '../contexts/order-engine-warnings';

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
	const metaDataKeys = useDocField(uiSettings, (value) => value.metaDataKeys);
	const cartConfig = useCartConfig();
	const reportEngineWarnings = useReportEngineWarnings();

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
				// The POS authored this line's price basis a moment ago, so a warning here
				// is an internal fault rather than a merchant condition — reported all the
				// same, because "every engine call site in core reports" is the rule, and a
				// site exempted by argument is how the dropped-warnings comment spread.
				const computed = calculateCartLine({ kind: 'line_item', line: newLineItem }, cartConfig);
				reportEngineWarnings(computed.warnings, {
					orderId: currentOrderRecord.uuid,
					site: 'useAddVariation',
				});
				newLineItem = computed.line as typeof newLineItem;
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
			cartConfig,
			addItemToOrder,
			reportEngineWarnings,
			t,
		]
	);

	return { addVariation };
};
