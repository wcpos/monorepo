import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { isRxDocument } from '@wcpos/database';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

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
import { useCurrentOrderActions } from '../contexts/current-order';

const cartLogger = getLogger(['wcpos', 'pos', 'cart']);

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export const useAddProduct = () => {
	const { addItemToOrder } = useAddItemToOrder();
	const { calculateLineItemTaxesAndTotals } = useCalculateLineItemTaxAndTotals();
	/**
	 * Resolved when the button is pressed, NOT subscribed during render.
	 *
	 * Every product tile calls this hook, so subscribing to the current order here meant every
	 * cart write re-rendered every visible tile — measured at 20 tiles x 4 writes = 80 commits
	 * per add or remove. Nothing this hook does needs the order until the user acts.
	 */
	const { getCurrentOrder } = useCurrentOrderActions();
	const { incrementLineItem } = useUpdateLineItem();
	const t = useT();
	const { uiSettings } = useUISettings('pos-products');
	const metaDataKeys = useObservableEagerState(uiSettings.metaDataKeys$);

	/**
	 * Add product to order, or increment quantity if already in order
	 *
	 * NOTE: for the miscellaneous product we pass in an object!! Not a document
	 */
	const addProduct = React.useCallback(
		async (
			data: ProductDocument | { id: number; [key: string]: any },
			options?: { silent?: boolean }
		) => {
			let success;
			let product = data;

			const currentOrder = getCurrentOrder();
			// Built here rather than memoised in render, so this hook reads nothing
			// order-shaped until the press happens.
			const orderLogger = cartLogger.with({
				orderUUID: currentOrder.uuid,
				orderID: currentOrder.id,
				orderNumber: currentOrder.number,
			});

			// always make sure we have the latest product document
			if (isRxDocument(data)) {
				const latest = data.getLatest();
				product = latest.toMutableJSON();
			}

			const lineItems = currentOrder.getLatest().line_items ?? [];

			// check if product is already in order, if so increment quantity
			if (!(currentOrder as unknown as { isNew?: boolean }).isNew && product.id !== 0) {
				const matches = findByProductVariationID(lineItems, product.id ?? 0);
				if (matches && matches.length === 1) {
					const uuid = getUuidFromLineItem(matches[0]);
					if (uuid) {
						success = await incrementLineItem(uuid, 1);
						if (success === false) return false;
					}
				}
			}

			// if product is not in order, add it
			if (!success) {
				const keys = metaDataKeys ? metaDataKeys.split(',') : [];
				let newLineItem = convertProductToLineItemWithoutTax(product as ProductDocument, keys);
				newLineItem = calculateLineItemTaxesAndTotals(newLineItem);
				success = await addItemToOrder('line_items', newLineItem);
				if (success === false) return false;
			}

			// returned success should be the updated order
			if (success) {
				orderLogger.success(t('common.added_to_cart', { name: product.name }), {
					// Scan-driven adds toast via the scan-feedback module instead.
					showToast: !options?.silent,
					context: {
						productId: product.id,
						productName: product.name,
					},
				});
				return true;
			} else {
				orderLogger.error('Failed to add product to cart', {
					showToast: true,
					code: ERROR_CODES.CART_UPDATE_FAILED,
					toast: { title: t('pos.error_adding_to_cart', { name: product.name }) },
					context: {
						productId: product.id,
						productName: product.name,
					},
				});
				return false;
			}

			return Boolean(success);
		},
		[
			getCurrentOrder,
			incrementLineItem,
			metaDataKeys,
			calculateLineItemTaxesAndTotals,
			addItemToOrder,
			t,
		]
	);

	return { addProduct };
};
