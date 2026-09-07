import * as React from 'react';

import { useRouter } from 'expo-router';

import { type EngineRecord, useQueryRuntime, useRecordField } from '@wcpos/query';
import { remoteIdOrNull } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';

import { useTheme } from '../../../../../contexts/theme';
import { enterReceipt, leaveCheckout } from '../checkout-mode';
import { useUISettings } from '../../../contexts/ui-settings';
import { useStockAdjustment } from '../../../hooks/use-stock-adjustment';
import { useCurrentOrderActions } from '../../contexts/current-order/context';

const ORDER_REFRESH_TIMEOUT_MS = 10_000;
const logger = getLogger(['wcpos', 'pos', 'checkout']);

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
	order: EngineRecord<'orders'>,
	receiptHost: 'stage' | 'modal' = 'stage'
): (options?: CompleteOrderFlowOptions) => Promise<void> {
	const runtime = useQueryRuntime();
	const { stockAdjustment } = useStockAdjustment();
	const { uiSettings } = useUISettings('pos-cart');
	const router = useRouter();
	const { screenSize } = useTheme();
	const { setCurrentOrderID } = useCurrentOrderActions();
	const orderId = useRecordField(order, (record) => record.payload.id);

	return React.useCallback(
		async ({ refresh = true }: CompleteOrderFlowOptions = {}) => {
			// Enter the receipt stage BEFORE the refresh below. The final payment has already
			// patched the order out of `pos-open`, so the current-order provider is about to fall
			// back to the new-order placeholder; if the stage waited for the (up to 10 s) refresh,
			// the columns would show an empty cart while the paid order was nowhere on screen.
			// The stage renders from its own record and shows the syncing badge until data lands.
			if (receiptHost === 'stage' && uiSettings.autoShowReceipt) {
				enterReceipt(order.uuid);
			}
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
				} catch (error) {
					// The payment is already recorded and the receipt stage already shown; a
					// refresh that fails must degrade to the local record, not surface as a
					// payment error and skip the stock reconciliation below.
					logger.warn('Post-payment order refresh failed; completing from the local record', {
						context: {
							orderId: order.uuid,
							error: error instanceof Error ? error.message : String(error),
						},
					});
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

			// The pre-tender contract checkout still hosts receipts in a routed modal.
			if (receiptHost === 'modal') {
				setCurrentOrderID('');
				router.replace(
					uiSettings.autoShowReceipt
						? {
								pathname: '/(app)/(drawer)/(pos)/(modals)/cart/receipt/[orderId]',
								params: { orderId: order.uuid },
							}
						: { pathname: '/cart' }
				);
				return;
			}

			if (!uiSettings.autoShowReceipt) {
				leaveCheckout(order.uuid);
				setCurrentOrderID('');
				if (screenSize === 'sm') router.replace({ pathname: '/cart' });
			}
		},
		[
			receiptHost,
			runtime,
			order,
			orderId,
			router,
			screenSize,
			setCurrentOrderID,
			stockAdjustment,
			uiSettings.autoShowReceipt,
		]
	);
}
