import * as React from 'react';

import { useRouter } from 'expo-router';

import { adoptStoreOrderSnapshot, type EngineRecord, useQueryRuntime } from '@wcpos/query';
import { type CategoryLogger, getErrorMessage } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { leaveCheckout } from '../checkout-mode';
import { useCompleteOrderFlow } from '../hooks/use-complete-order-flow';
import { returnToTill } from '../till-route';
import { useTheme } from '../../../../../contexts/theme';
import { useT } from '../../../../../contexts/translations';
import { useCurrentOrderActions } from '../../contexts/current-order';
import { useUISettings } from '../../../contexts/ui-settings';

import type { JudgedGatewaySnapshot } from './gateway-snapshot';

/**
 * Settle a paid gateway snapshot exactly once per mount: latch, toast, route, adopt, complete.
 * Route FIRST; the local refresh is catch-up, never a gate. Awaiting it left cashiers on a
 * spinning "Process payment" after a paid sale: orders #117902 and #118391 (2026-08-29) both
 * logged "payment completed", the server had them paid, and the receipt never opened, because
 * the require's `ready` never settled and the latch had already disarmed the fallback poll.
 */
export function useSettleGatewaySnapshot(
	order: EngineRecord<'orders'>,
	receiptHost: 'modal' | 'stage',
	orderLogger: CategoryLogger
) {
	const router = useRouter();
	const { screenSize } = useTheme();
	const completeOrderFlow = useCompleteOrderFlow(order, receiptHost);
	const { setCurrentOrderID } = useCurrentOrderActions();
	const { uiSettings } = useUISettings('pos-cart');
	const t = useT();
	const runtime = useQueryRuntime();
	// Whichever path sees the sale finish first settles it; a late message or poll answer for the
	// same order must not route and toast a second time.
	const latch = React.useRef(false);
	const isSettled = React.useCallback(() => latch.current, []);

	const settle = React.useCallback(
		async (
			judged: JudgedGatewaySnapshot,
			source: 'pay-page-message' | 'fallback-refresh'
		): Promise<void> => {
			latch.current = true;
			const fromMessage = source === 'pay-page-message';
			const snapshot = judged.outcome.snapshot;
			const local = order.getLatest().payload;
			try {
				orderLogger.success(
					t('pos_checkout.payment_completed_for_order', {
						orderNumber: snapshot.number || local.number,
					}),
					{
						showToast: true,
						context: {
							total: snapshot.total,
							paymentMethod: snapshot.payment_method,
							paymentMethodTitle: snapshot.payment_method_title,
							...(fromMessage ? { transactionId: snapshot.transaction_id } : {}),
							status: snapshot.status,
							...(fromMessage ? {} : { source }),
						},
					}
				);
				if (receiptHost === 'modal') setCurrentOrderID('');
				if (receiptHost === 'stage') {
					// completeOrderFlow('stage') enters the receipt itself (completeSale, before any await);
					// it never leaves checkout for a gateway snapshot, so that half is ours.
					if (!uiSettings.autoShowReceipt) {
						leaveCheckout(order.uuid);
						setCurrentOrderID('');
					}
				} else if (uiSettings.autoShowReceipt) {
					router.replace({
						pathname: '/(app)/(drawer)/(pos)/(modals)/cart/receipt/[orderId]',
						params: { orderId: order.uuid },
					});
				} else {
					returnToTill(router, screenSize === 'sm', 'products');
				}
				// Catch-up after a PAID sale that already routed; the order syncs on the next pass, so
				// a miss is forensic, and only the message path has ever recorded it.
				void adoptStoreOrderSnapshot(runtime.engine, snapshot, local.id).then((result) => {
					if (!fromMessage) return;
					if (result.adoption !== 'applied' && result.adoption !== 'rejected') {
						orderLogger.debug('Checkout order snapshot was not applied', {
							context: { outcome: result.adoption },
						});
					}
					if ('refreshError' in result) {
						orderLogger.debug('Post-payment order refresh did not complete', {
							context: { error: getErrorMessage(result.refreshError) },
						});
					}
				});
				await completeOrderFlow(judged.outcome);
			} catch (err) {
				if (!fromMessage) {
					// Best-effort safety net only: a failed or premature poll must NOT surface as a
					// payment-gateway failure (it produced spurious PY02001 errors on paid checkouts).
					orderLogger.debug('Fallback order status refresh did not complete', {
						context: { error: getErrorMessage(err), source: 'fallback-refresh' },
					});
					return;
				}
				// The payment already succeeded; only the follow-up failed. A warning, never
				// a red "payment" error a cashier could read as "charge again" (owner, 2026-10-17).
				const errorMessage = err instanceof Error ? err.message : 'Payment processing error';
				orderLogger.warn(errorMessage, {
					showToast: true,
					code: ERROR_CODES.PAYMENT_OK_STATUS_CHECK_FAILED,
					context: { error: getErrorMessage(err) },
				});
			}
		},
		[
			order,
			receiptHost,
			orderLogger,
			router,
			screenSize,
			completeOrderFlow,
			setCurrentOrderID,
			uiSettings.autoShowReceipt,
			t,
			runtime,
		]
	);

	return { isSettled, settle };
}
