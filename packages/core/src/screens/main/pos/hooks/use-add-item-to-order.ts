import * as React from 'react';

import { v4 as uuidv4 } from 'uuid';

import { useQueryManager } from '@wcpos/query';

import { useCartStockGuard } from './use-cart-stock-guard';
import { convertLocalDateToUTCString } from '../../../../hooks/use-local-date';
import {
	documentRecordId,
	insertEngineResident,
	useLocalMutation,
} from '../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../contexts/current-order';

type LineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];
type FeeLine = NonNullable<import('@wcpos/database').OrderDocument['fee_lines']>[number];
type ShippingLine = NonNullable<import('@wcpos/database').OrderDocument['shipping_lines']>[number];
type CouponLine = NonNullable<import('@wcpos/database').OrderDocument['coupon_lines']>[number];
type CartLine = LineItem | FeeLine | ShippingLine | CouponLine;
type CartLineType = 'line_items' | 'fee_lines' | 'shipping_lines' | 'coupon_lines';

interface AddItemOptions {
	skipStockGuard?: boolean;
}

export const useAddItemToOrder = () => {
	const { currentOrder, setCurrentOrderID } = useCurrentOrder();
	const manager = useQueryManager();
	const { localPatch } = useLocalMutation();
	const { stockGuardEnabled, checkCartStock, showBackorderWarning } = useCartStockGuard();
	const appendChains = React.useRef(new Map<string, Promise<void>>());

	/**
	 *
	 */
	const saveNewOrder = React.useCallback(
		async (type: CartLineType, data: CartLine) => {
			const order = currentOrder.getLatest();
			const date_created_gmt = convertLocalDateToUTCString(new Date());

			const orderJSON: Record<string, unknown> = {
				...order.toMutableJSON(),
				date_created_gmt,
				[type]: [data],
			};
			const recordId = documentRecordId(order);
			if (!recordId) throw new Error('New order is missing its uuid');
			const resident = await insertEngineResident({
				manager,
				collection: 'orders',
				recordId,
				payload: orderJSON,
			});
			await manager.engine.write({
				collection: 'orders',
				operation: 'create',
				recordId,
				payload: resident.toMutableJSON().payload as Record<string, unknown>,
			});
			await order.remove();
			setCurrentOrderID(recordId);
			return resident;
		},
		[currentOrder, manager, setCurrentOrderID]
	);

	/**
	 * NOTE: If I don't include getLatest(), the populate() will return old data
	 */
	const addItemToOrder = React.useCallback(
		async (type: CartLineType, data: CartLine, options?: AddItemOptions) => {
			const order = currentOrder.getLatest();
			let stockWarningName: string | null = null;

			// make sure items have a uuid before saving
			data.meta_data = data.meta_data || [];
			const meta = data.meta_data.find((meta: any) => meta.key === '_woocommerce_pos_uuid');
			const metaUUID = meta && meta.value;

			if (!metaUUID) {
				data.meta_data.push({
					key: '_woocommerce_pos_uuid',
					value: uuidv4(),
				});
			}

			const recordId = documentRecordId(order);
			if (!recordId) throw new Error('Order is missing its uuid');
			const isNew = Boolean((order as unknown as { isNew?: boolean }).isNew);
			const previous = isNew
				? Promise.resolve()
				: (appendChains.current.get(recordId) ?? Promise.resolve());
			const append = previous.then(async () => {
				const latest = isNew ? order : order.getLatest();
				if (
					type === 'line_items' &&
					stockGuardEnabled &&
					(data as LineItem).product_id !== 0 &&
					!options?.skipStockGuard
				) {
					const lineItem = data as LineItem;
					const stockResult = await checkCartStock({
						lineItems: latest.line_items ?? [],
						productId: lineItem.product_id ?? 0,
						variationId: lineItem.variation_id ?? 0,
						requestedQuantity: lineItem.quantity ?? 1,
						name: lineItem.name,
					});
					if (!stockResult.allowed) return;
					if (stockResult.warning === 'backorder') {
						stockWarningName = stockResult.name;
					}
				}

				if (isNew) return saveNewOrder(type, data);
				return localPatch({
					document: latest,
					data: {
						[type]: [...((latest[type] as CartLine[] | undefined) ?? []), data],
					} as never,
				});
			});
			const tail = append.then(
				() => undefined,
				() => undefined
			);
			if (!isNew) {
				appendChains.current.set(recordId, tail);
				void tail.then(() => {
					if (appendChains.current.get(recordId) === tail) {
						appendChains.current.delete(recordId);
					}
				});
			}
			const result = await append;
			if (stockWarningName !== null) showBackorderWarning(stockWarningName);
			return result;
		},
		[
			checkCartStock,
			currentOrder,
			localPatch,
			saveNewOrder,
			showBackorderWarning,
			stockGuardEnabled,
		]
	);

	return { addItemToOrder };
};
