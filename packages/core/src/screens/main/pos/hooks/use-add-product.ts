import * as React from 'react';

import { type EngineRecord, useDocField } from '@wcpos/query';
import { MISC_PRODUCT_ID, wooIdOf } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';

import { reportCartFailure } from './cart-failure';
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
	const { getCurrentOrderRecord } = useCurrentOrderActions();
	const { incrementLineItem } = useUpdateLineItem();
	const t = useT();
	const { uiSettings } = useUISettings('pos-products');
	const metaDataKeys = useDocField(uiSettings, (value) => value.metaDataKeys);

	/**
	 * Add product to order, or increment quantity if already in order
	 *
	 * NOTE: for the miscellaneous product we pass in an object!! Not a document
	 */
	const addProduct = React.useCallback(
		async (
			data: EngineRecord<'products'> | { id: number; [key: string]: any },
			options?: { silent?: boolean }
		) => {
			let success;
			let product: ProductDocument | { id: number; [key: string]: any };

			const currentOrderRecord = getCurrentOrderRecord();
			// Built here rather than memoised in render, so this hook reads nothing
			// order-shaped until the press happens.
			const orderLogger = cartLogger.with({
				orderUUID: currentOrderRecord.uuid,
				orderID: currentOrderRecord.payload.id,
				orderNumber: currentOrderRecord.payload.number,
			});

			// always make sure we have the latest product document
			if (typeof (data as { getLatest?: unknown }).getLatest === 'function') {
				const latest = (data as EngineRecord<'products'>).getLatest();
				// A products-collection document claiming to be a variation is misfiled
				// (the pre-fix products search lane persisted Woo's variation-typed
				// sku-leg rows; scope-open purges residue, but a document made dirty
				// before the purge survives it). Building a PRODUCT line from it would
				// write product_id = the variation's woo id with no variation_id and no
				// attributes — a silently malformed order line. Refuse instead.
				if (String(latest.payload?.type) === 'variation') {
					reportCartFailure(
						orderLogger,
						'Refused to add a misfiled variation document as a product',
						{
							toastTitle: t('pos.error_adding_to_cart', { name: latest.payload?.name ?? '' }),
							context: {
								productId: latest.remoteId === null ? undefined : wooIdOf(latest.remoteId),
								reason: 'products-collection document has type variation',
							},
						}
					);
					return false;
				}
				product = {
					...latest.payload,
					// NOTE: the wc/v3 wire overloads 0, so a born-local product that has not been
					// pushed yet is indistinguishable from a misc product from here on.
					id: latest.remoteId === null ? MISC_PRODUCT_ID : wooIdOf(latest.remoteId),
				};
			} else {
				product = data as { id: number; [key: string]: any };
			}

			const lineItems = currentOrderRecord.getLatest().payload.line_items ?? [];

			// check if product is already in order, if so increment quantity
			if (!(currentOrderRecord as { isNew?: boolean }).isNew && product.id !== 0) {
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
				reportCartFailure(orderLogger, 'Failed to add product to cart', {
					toastTitle: t('pos.error_adding_to_cart', { name: product.name }),
					context: {
						productId: product.id,
						productName: product.name,
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

	return { addProduct };
};
