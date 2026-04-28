import * as React from 'react';

import { useRouter } from 'expo-router';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../../../contexts/translations';
import {
	PaymentGatewayContract,
	supportsCheckoutContract,
} from '../../../hooks/payment-gateway-contract';
import { usePullDocument } from '../../../contexts/use-pull-document';
import { useUISettings } from '../../../contexts/ui-settings';
import { useRestHttpClient } from '../../../hooks/use-rest-http-client';
import { usePaymentGateways } from '../../../hooks/use-payment-gateways';
import { useStockAdjustment } from '../../../hooks/use-stock-adjustment';

const checkoutLogger = getLogger(['wcpos', 'pos', 'checkout', 'contract']);

type OrderDocument = import('@wcpos/database').OrderDocument;

export type GatewayContract = PaymentGatewayContract;

interface CheckoutState {
	checkout_id?: string | null;
	order_id?: number;
	gateway_id?: string;
	status?: string;
	provider_data?: Record<string, unknown>;
	terminal?: boolean;
}

export function isTerminalCheckoutStatus(status?: string) {
	return ['completed', 'failed', 'cancelled', 'awaiting_customer'].includes(status || '');
}

export function shouldUseContractCheckout(gateway?: GatewayContract | null) {
	return supportsCheckoutContract(gateway);
}

export function createCheckoutIdempotencyKey(
	orderId: number,
	gatewayId: string,
	attemptId: string
) {
	return `checkout-${orderId}-${gatewayId}-${attemptId}`;
}

export function useCheckoutSession(order: OrderDocument) {
	const http = useRestHttpClient();
	const pullDocument = usePullDocument();
	const { stockAdjustment } = useStockAdjustment();
	const { uiSettings } = useUISettings('pos-cart');
	const router = useRouter();
	const t = useT();
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const checkoutAttemptIdRef = React.useRef<string | null>(null);

	const gatewayId = React.useMemo(() => order.payment_method || 'pos_cash', [order.payment_method]);
	const {
		gateway,
		loading: gatewayLoading,
		error: gatewayError,
		refetch,
	} = usePaymentGateways(gatewayId);
	const gatewayResolved = !gatewayLoading;

	React.useEffect(() => {
		if (gatewayError) {
			setError('payment_gateways_fetch_failed');
		}
	}, [gatewayError]);

	React.useEffect(() => {
		checkoutAttemptIdRef.current = null;
	}, [gatewayId, order.id]);

	const completeOrderFlow = React.useCallback(async () => {
		await pullDocument(order.id!, order.collection as never);
		const latest = order.getLatest();
		const reducedStockItems = (latest.line_items || []).filter((item) =>
			(item.meta_data as { key: string }[] | undefined)?.some(
				(meta) => meta.key === '_reduced_stock'
			)
		);
		stockAdjustment(reducedStockItems);

		if (uiSettings.autoShowReceipt) {
			router.replace({ pathname: `(modals)/cart/receipt/${order.uuid}` });
		} else {
			router.replace({ pathname: `cart` });
		}
	}, [order, pullDocument, router, stockAdjustment, uiSettings.autoShowReceipt]);

	const startCheckout = React.useCallback(async () => {
		if (!order.id || !gatewayResolved) return;
		setLoading(true);
		setError(null);

		let resolvedGateway = gateway;
		if (!resolvedGateway) {
			const gateways = await refetch();
			resolvedGateway = gateways.find((item) => item.id === gatewayId) || null;
		}
		if (!resolvedGateway || !shouldUseContractCheckout(resolvedGateway)) {
			setLoading(false);
			return;
		}

		try {
			if (!checkoutAttemptIdRef.current) {
				checkoutAttemptIdRef.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
			}

			await http.post(`payment-gateways/${resolvedGateway.id}/bootstrap`, {
				context: { order_id: order.id },
			});

			const response = await http.post(
				`orders/${order.id}/checkout`,
				{
					gateway_id: resolvedGateway.id,
					action: 'start',
					payment_data: {},
				},
				{
					headers: {
						'X-WCPOS-Idempotency-Key': createCheckoutIdempotencyKey(
							order.id,
							resolvedGateway.id,
							checkoutAttemptIdRef.current
						),
					},
				}
			);

			let state = (response?.data || {}) as CheckoutState;
			let attempts = 0;
			while (!isTerminalCheckoutStatus(state.status) && !state.terminal) {
				attempts += 1;
				if (attempts > 40) {
					throw new Error('checkout_poll_timeout');
				}

				await new Promise((resolve) => setTimeout(resolve, 750));
				const poll = await http.get(`orders/${order.id}/checkout`);
				state = (poll?.data || {}) as CheckoutState;
			}

			checkoutAttemptIdRef.current = null;

			if (state.status === 'completed') {
				checkoutLogger.success(
					t('pos_checkout.payment_completed_for_order', {
						orderNumber: order.number,
					}),
					{
						showToast: true,
						saveToDb: true,
						context: {
							orderId: order.id,
							gatewayId: resolvedGateway.id,
							checkoutId: state.checkout_id,
						},
					}
				);
				await completeOrderFlow();
				return;
			}

			if (state.status === 'awaiting_customer') {
				setError('awaiting_customer');
				return;
			}

			throw new Error(state.status || 'checkout_failed');
		} catch (err) {
			const message = err instanceof Error ? err.message : 'checkout_failed';
			setError(message);
			checkoutLogger.error(message, {
				showToast: true,
				saveToDb: true,
				context: {
					errorCode: ERROR_CODES.PAYMENT_GATEWAY_ERROR,
					orderId: order.id,
					gatewayId: resolvedGateway?.id,
				},
			});
		} finally {
			setLoading(false);
		}
	}, [completeOrderFlow, gateway, gatewayId, gatewayResolved, http, order, refetch, t]);

	const mode = !gatewayResolved
		? 'pending'
		: shouldUseContractCheckout(gateway)
			? 'contract'
			: 'webview';

	return {
		loading,
		error,
		gateway,
		gatewayResolved,
		gatewayId,
		mode,
		startCheckout,
	};
}
