import * as React from 'react';

import { useRouter } from 'expo-router';

import { type EngineRecord } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';

import { useTheme } from '../../../../../contexts/theme';
import { useT } from '../../../../../contexts/translations';
import { getCheckoutModeSnapshot, leaveCheckout, selectReceipt } from '../checkout-mode';
import { returnToTill } from '../till-route';
import { type CheckoutHost, useLeaveCheckoutHost } from '../receipt-stage/use-finish-sale';
import { useUISettings } from '../../../contexts/ui-settings';
import { useCurrentOrderActions } from '../../contexts/current-order/context';
import { completeSale, type SaleOutcome } from '../sale-completion';
import { useSaleContext } from './use-sale-context';

import type { OrderMutationContext } from '../../hooks/order-mutation-queue';

const logger = getLogger(['wcpos', 'pos', 'checkout']);

/** Finish checkout from the freshest available order before leaving the cart. */
export function useCompleteOrderFlow(
	order: EngineRecord<'orders'>,
	receiptHost: 'stage' | 'modal' = 'stage',
	checkoutHost?: CheckoutHost
): (outcome: SaleOutcome, queue?: OrderMutationContext) => Promise<void> {
	const complete = useCompleteOrderFlowForOrder(receiptHost, checkoutHost);
	return React.useCallback((outcome, queue) => complete(order, outcome, queue), [complete, order]);
}

/**
 * Cart commands finish their captured order, even if the cashier has switched tabs. A cart
 * command's host is the cart itself: a phone tab the till leaves as it leaves the modal, or the
 * wide columns, which stay.
 */
export function useCompleteOrderFlowForOrder(
	receiptHost: 'stage' | 'modal' = 'stage',
	checkoutHost?: CheckoutHost
) {
	const ctx = useSaleContext();
	const { uiSettings } = useUISettings('pos-cart');
	const router = useRouter();
	const { screenSize } = useTheme();
	const leaveHost = useLeaveCheckoutHost(
		checkoutHost ?? (screenSize === 'sm' ? 'modal' : 'columns')
	);
	const t = useT();
	const { setCurrentOrderID, getCurrentOrderID } = useCurrentOrderActions();

	return React.useCallback(
		async (order: EngineRecord<'orders'>, outcome: SaleOutcome, queue?: OrderMutationContext) => {
			const result = await completeSale(
				ctx,
				order,
				outcome,
				receiptHost === 'stage'
					? {
							host: 'stage',
							autoShowReceipt: !!uiSettings.autoShowReceipt,
							canSelectReceipt: () => {
								const { selectedReceiptOrder } = getCheckoutModeSnapshot();
								return (
									getCurrentOrderID() === order.uuid &&
									(selectedReceiptOrder === null || selectedReceiptOrder === order.uuid)
								);
							},
						}
					: { host: 'modal' },
				queue
			);
			switch (result) {
				case 'unconfirmed': // The store took it; the bridge finishes the sale when it confirms.
					logger.info(t('pos_checkout.payment_confirming'), {
						showToast: true,
						context: { orderUUID: order.uuid },
					});
					return;
				case 'partial':
				case 'not-completed':
					return;
				case 'completed':
				case 'sent': // A sent sale leaves the till exactly as a completed one does (spec §4.2).
					break;
				default:
					return result satisfies never;
			}
			// The webview already routed before catch-up; never route it a second time.
			if (outcome.source === 'gateway-snapshot') return;
			if (getCurrentOrderID() !== order.uuid) {
				if (getCheckoutModeSnapshot().selectedReceiptOrder === order.uuid) selectReceipt(null);
				leaveCheckout(order.uuid);
				return;
			}

			// The pre-tender contract checkout still hosts receipts in a routed modal.
			if (receiptHost === 'modal') {
				setCurrentOrderID('');
				if (uiSettings.autoShowReceipt) {
					router.replace({
						pathname: '/(app)/(drawer)/(pos)/(modals)/cart/receipt/[orderId]',
						params: { orderId: order.uuid },
					});
				} else {
					returnToTill(router, screenSize === 'sm', 'products');
				}
				return;
			}

			if (!uiSettings.autoShowReceipt) {
				leaveCheckout(order.uuid);
				setCurrentOrderID('');
				leaveHost();
			}
		},
		[
			ctx,
			receiptHost,
			router,
			screenSize,
			leaveHost,
			setCurrentOrderID,
			getCurrentOrderID,
			uiSettings.autoShowReceipt,
			t,
		]
	);
}
