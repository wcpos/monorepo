import * as React from 'react';

import { Button, ButtonText } from '@wcpos/components/button';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import type { AwaitingCustomerStamp } from '@wcpos/order-math';
import type { EngineRecord } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../../contexts/translations';
import { setTenderMethod } from '../../pos/checkout/checkout-mode';
import { useGatewayPayment } from '../../pos/checkout/payments/use-gateway-payment';
import { useReopenOrder } from './use-reopen-order';

const logger = getLogger(['wcpos', 'orders', 'invoice']);

/**
 * Spec §4.3, after `sent`: *Send again* re-opens the order at this till with the gateway
 * already chosen, so the pane comes up on its helpers (a new attempt replaces the stamp's);
 * *Cancel invoice* names the attempt the store holds, and the order comes back pos-open.
 */
export function InvoiceActions({
	order,
	stamp,
}: {
	order: EngineRecord<'orders'>;
	stamp: AwaitingCustomerStamp;
}) {
	const t = useT();
	const reopen = useReopenOrder(order);
	const gateway = useGatewayPayment();
	const online = useOnlineStatus().status === 'online-website-available';
	const [busy, setBusy] = React.useState(false);
	// State drives the button; the ref closes the same-tick gap a fast double tap falls into.
	const busyRef = React.useRef(false);
	const cancel = React.useCallback(async () => {
		if (busyRef.current) return;
		busyRef.current = true;
		setBusy(true);
		try {
			const outcome = await gateway.cancel(order, stamp);
			if (outcome.kind === 'refused') {
				logger.error(outcome.message, {
					code: ERROR_CODES.PAYMENT_GATEWAY_REFUSED,
					showToast: true,
					context: { orderId: order.uuid, method: stamp.method_id, refusal: outcome.code },
				});
				return;
			}
			logger.info(t('pos_checkout.invoice_cancelled'), {
				showToast: true,
				context: {
					orderId: order.uuid,
					type: 'checkout.cancelled',
					method: stamp.method_id,
					attemptId: stamp.attempt_id,
					voided: 0,
				},
			});
		} catch (error) {
			logger.error(t('pos_checkout.invoice_cancel_failed'), {
				code: ERROR_CODES.PAYMENT_UNEXPECTED,
				showToast: true,
				context: {
					orderId: order.uuid,
					error: error instanceof Error ? error.message : String(error),
				},
			});
		} finally {
			busyRef.current = false;
			setBusy(false);
		}
	}, [gateway, order, stamp, t]);
	return (
		<>
			{/* Destructive sits apart from constructive: ghost on the left, never the same weight. */}
			<Button
				variant="ghost-destructive"
				className="mr-auto"
				testID="orders-cancel-invoice"
				disabled={busy || !online}
				loading={busy}
				onPress={() => void cancel()}
			>
				<ButtonText>{t('pos_checkout.cancel_invoice')}</ButtonText>
			</Button>
			<Button
				variant="outline"
				testID="orders-send-again"
				disabled={busy}
				onPress={() => {
					setTenderMethod(order.uuid, stamp.method_id);
					void reopen();
				}}
			>
				<ButtonText>{t('pos_checkout.send_again')}</ButtonText>
			</Button>
		</>
	);
}
