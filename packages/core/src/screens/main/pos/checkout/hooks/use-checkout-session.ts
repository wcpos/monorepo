import * as React from 'react';

import { useRouter } from 'expo-router';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../../../contexts/translations';
import { usePullDocument } from '../../../contexts/use-pull-document';
import { useUISettings } from '../../../contexts/ui-settings';
import { useRestHttpClient } from '../../../hooks/use-rest-http-client';
import { useStockAdjustment } from '../../../hooks/use-stock-adjustment';

const checkoutLogger = getLogger(['wcpos', 'pos', 'checkout', 'contract']);

type OrderDocument = import('@wcpos/database').OrderDocument;

export interface GatewayContract {
	id: string;
	provider: string;
	pos_type: string;
	capabilities?: {
		supports_checkout?: boolean;
	};
}

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
	return Boolean(
		gateway &&
		gateway.provider === 'wcpos' &&
		gateway.pos_type === 'manual' &&
		gateway.capabilities?.supports_checkout !== false
	);
}

export function createCheckoutIdempotencyKey(orderId: number, gatewayId: string) {
	return `checkout-${orderId}-${gatewayId}-${Date.now()}`;
}

export function useCheckoutSession(order: OrderDocument) {
	const http = useRestHttpClient();
	const pullDocument = usePullDocument();
	const { stockAdjustment } = useStockAdjustment();
	const { uiSettings } = useUISettings('pos-cart');
	const router = useRouter();
	const t = useT();
	const [gateway, setGateway] = React.useState<GatewayContract | null>(null);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	const gatewayId = React.useMemo(() => order.payment_method || 'pos_cash', [order.payment_method]);

	const fetchGateway = React.useCallback(async () => {
		try {
			const response = await http.get('payment-gateways');
			const gateways = Array.isArray(response?.data) ? response.data : [];
			const match = gateways.find((item: GatewayContract) => item.id === gatewayId) || null;
			setGateway(match);
			return match;
		} catch {
			setGateway(null);
			return null;
		}
	}, [gatewayId, http]);

	React.useEffect(() => {
		void fetchGateway();
	}, [fetchGateway]);

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
		if (!order.id) return;
		setLoading(true);
		setError(null);

		const resolvedGateway = gateway || (await fetchGateway());
		if (!shouldUseContractCheckout(resolvedGateway)) {
			setLoading(false);
			return;
		}

		try {
			await http.post(`payment-gateways/${resolvedGateway!.id}/bootstrap`, {
				context: { order_id: order.id },
			});

			const response = await http.post(
				`orders/${order.id}/checkout`,
				{
					gateway_id: resolvedGateway!.id,
					action: 'start',
					payment_data: {},
				},
				{
					headers: {
						'X-WCPOS-Idempotency-Key': createCheckoutIdempotencyKey(order.id, resolvedGateway!.id),
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
							gatewayId: resolvedGateway!.id,
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
	}, [completeOrderFlow, fetchGateway, gateway, http, order, t]);

	return {
		loading,
		error,
		gateway,
		gatewayId,
		mode: shouldUseContractCheckout(gateway) ? 'contract' : 'webview',
		startCheckout,
	};
}
