import * as React from 'react';

import { useRouter } from 'expo-router';

import { type EngineRecord, useQueryRuntime, useRecordField } from '@wcpos/query';
import { remoteIdOrNull } from '@wcpos/sync-core';

import { useUISettings } from '../../../contexts/ui-settings';
import { useStockAdjustment } from '../../../hooks/use-stock-adjustment';
import { useCurrentOrderActions } from '../../contexts/current-order/context';

const ORDER_REFRESH_TIMEOUT_MS = 10_000;

export interface CompleteOrderFlowOptions {
	/**
	 * Force-refresh the order from the server before routing. False when the payment
	 * was recorded offline: there is nothing to fetch, and the throw on a missing
	 * remote id would strand the cashier on a paid order.
	 */
	refresh?: boolean;
}

/** Finish checkout from the freshest available order before leaving the cart. */
export function useCompleteOrderFlow(
	order: EngineRecord<'orders'>
): (options?: CompleteOrderFlowOptions) => Promise<void> {
	const runtime = useQueryRuntime();
	const { stockAdjustment } = useStockAdjustment();
	const { uiSettings } = useUISettings('pos-cart');
	const router = useRouter();
	const { setCurrentOrderID } = useCurrentOrderActions();
	const orderId = useRecordField(order, (record) => record.payload.id);

	return React.useCallback(
		async ({ refresh = true }: CompleteOrderFlowOptions = {}) => {
			if (refresh) {
				if (!orderId) {
					throw new Error('checkout_refresh_requires_persisted_order');
				}
				const handle = runtime.engine.require({
					id: `checkout:order-refresh:${orderId}`,
					collection: 'orders',
					kind: 'targeted-records',
					remoteIds: [orderId].map(remoteIdOrNull).filter((remoteId) => remoteId !== null),
					forceRefresh: true,
				});
				let timer: ReturnType<typeof setTimeout> | undefined;
				try {
					await Promise.race([
						handle.ready,
						new Promise<void>((resolve) => {
							timer = setTimeout(resolve, ORDER_REFRESH_TIMEOUT_MS);
						}),
					]);
				} finally {
					if (timer) clearTimeout(timer);
					handle.release();
				}
			}

			const latest = order.getLatest().payload;
			const reducedStockItems = (latest.line_items || []).filter((item) =>
				(item.meta_data as { key: string }[] | undefined)?.some(
					(meta) => meta.key === '_reduced_stock'
				)
			);
			stockAdjustment(reducedStockItems);
			setCurrentOrderID('');

			if (uiSettings.autoShowReceipt) {
				router.replace({
					pathname: '/(app)/(drawer)/(pos)/(modals)/cart/receipt/[orderId]',
					params: { orderId: order.uuid! },
				});
			} else {
				router.replace({ pathname: '/cart' });
			}
		},
		[
			runtime,
			order,
			orderId,
			router,
			setCurrentOrderID,
			stockAdjustment,
			uiSettings.autoShowReceipt,
		]
	);
}
