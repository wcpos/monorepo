import * as React from 'react';

import { useRouter } from 'expo-router';

import { readLedger } from '@wcpos/order-math';
import { type EngineRecord, useQueryRuntime } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';

import { useStoreSession } from '../../../../../contexts/app-state';
import { useTheme } from '../../../../../contexts/theme';
import { enterReceipt, leaveCheckout } from '../checkout-mode';
import { useUISettings } from '../../../contexts/ui-settings';
import { useStockAdjustment } from '../../../hooks/use-stock-adjustment';
import { useCurrentOrderActions } from '../../contexts/current-order/context';
import { reportProvenanceGap } from '../provenance/provenance-gap';
import { reconcileCompletedOrder } from './reconcile-completed-order';

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
	const { wpCredentials, userDB, site, store } = useStoreSession();
	const actor = React.useMemo(
		() => ({
			id: String(wpCredentials.id ?? ''),
			name: wpCredentials.display_name || wpCredentials.username || '',
		}),
		[wpCredentials.id, wpCredentials.display_name, wpCredentials.username]
	);
	const { stockAdjustment } = useStockAdjustment();
	const { uiSettings } = useUISettings('pos-cart');
	const router = useRouter();
	const { screenSize } = useTheme();
	const { setCurrentOrderID } = useCurrentOrderActions();

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
			await reconcileCompletedOrder(runtime, order, refresh, stockAdjustment);
			const latest = order.getLatest().payload;
			await reportProvenanceGap({
				userDB,
				siteUuid: site.uuid!,
				storeId: store.id,
				order: { id: latest.id, uuid: order.uuid, meta_data: latest.meta_data },
			});
			logger.info(`Sale ${order.uuid} completed`, {
				actor,
				context: {
					type: 'checkout.completed',
					orderId: latest.id ?? null,
					orderUUID: order.uuid,
					orderNumber: latest.number,
					total: latest.total,
					paymentLegs: readLedger(latest.meta_data).filter(
						(row) =>
							row.status === 'captured' || (row.status === 'authorized' && row.recorded_offline)
					).length,
				},
			});

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
			actor,
			receiptHost,
			runtime,
			order,
			router,
			screenSize,
			setCurrentOrderID,
			stockAdjustment,
			uiSettings.autoShowReceipt,
			userDB,
			site.uuid,
			store.id,
		]
	);
}
