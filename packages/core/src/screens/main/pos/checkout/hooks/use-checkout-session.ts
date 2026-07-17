import * as React from 'react';

import { useRouter } from 'expo-router';

import { useQueryManager } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../../../contexts/translations';
import {
	PaymentGatewayContract,
	supportsCheckoutContract,
} from '../../../hooks/payment-gateway-contract';
import { useUISettings } from '../../../contexts/ui-settings';
import { useRestHttpClient } from '../../../hooks/use-rest-http-client';
import { usePaymentGateways } from '../../../hooks/use-payment-gateways';
import { useStockAdjustment } from '../../../hooks/use-stock-adjustment';
import {
	clearStockRejection,
	parseInsufficientStockError,
	setStockRejection,
} from '../../hooks/stock-rejection';

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

const LEGACY_WEBVIEW_GATEWAY_IDS = new Set(['pos_cash', 'pos_card', 'wcpos_cash', 'wcpos_card']);

export function shouldUseContractCheckout(gateway?: GatewayContract | null) {
	return supportsCheckoutContract(gateway) && !LEGACY_WEBVIEW_GATEWAY_IDS.has(gateway?.id || '');
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
	const manager = useQueryManager();
	const { stockAdjustment } = useStockAdjustment();
	const { uiSettings } = useUISettings('pos-cart');
	const router = useRouter();
	const t = useT();
	const [loading, setLoading] = React.useState(false);
	// Error raised by the checkout flow itself (set imperatively in handlers).
	const [checkoutError, setError] = React.useState<string | null>(null);
	const checkoutAttemptIdRef = React.useRef<string | null>(null);

	const gatewayId = React.useMemo(() => order.payment_method || 'pos_cash', [order.payment_method]);
	const {
		gateway,
		loading: gatewayLoading,
		error: gatewayError,
		refetch,
	} = usePaymentGateways(gatewayId);
	const gatewayResolved = !gatewayLoading;

	// The displayed error is the gateway fetch error (derived from the gateways
	// hook) when present, otherwise the checkout flow's own error. Derived during
	// render rather than synced into state via an effect.
	const error = gatewayError ? 'payment_gateways_fetch_failed' : checkoutError;

	React.useEffect(() => {
		checkoutAttemptIdRef.current = null;
	}, [gatewayId, order.id]);

	const completeOrderFlow = React.useCallback(async () => {
		if (!order.id) {
			throw new Error('checkout_refresh_requires_persisted_order');
		}
		const handle = manager.engine.require({
			id: `checkout:order-refresh:${order.id}`,
			collection: 'orders',
			kind: 'targeted-records',
			wooIds: [order.id],
			forceRefresh: true,
		});
		try {
			await handle.ready;
		} finally {
			handle.release();
		}

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
	}, [manager, order, router, stockAdjustment, uiSettings.autoShowReceipt]);

	const handleStockRejection = React.useCallback(
		(error: unknown) => {
			const rejectedItems = parseInsufficientStockError(error);
			if (!rejectedItems) return false;

			setStockRejection({ orderUuid: order.uuid ?? '', items: rejectedItems });
			checkoutAttemptIdRef.current = null;
			setError('insufficient_stock');
			const productIds = [...new Set(rejectedItems.map((item) => item.product_id))];
			const variationIds = [
				...new Set(rejectedItems.map((item) => item.variation_id).filter(Boolean)),
			];
			for (const [collection, wooIds] of [
				['products', productIds],
				['variations', variationIds],
			] as const) {
				if (wooIds.length === 0) continue;
				const handle = manager.engine.require({
					id: `checkout:stock-rejection:${collection}:${order.id}`,
					collection,
					kind: 'targeted-records',
					wooIds,
					forceRefresh: true,
				});
				void handle.ready.finally(() => handle.release()).catch(() => undefined);
			}
			return true;
		},
		[manager, order.id, order.uuid]
	);

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
				clearStockRejection();
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
			if (handleStockRejection(err)) return;
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
	}, [
		completeOrderFlow,
		gateway,
		gatewayId,
		gatewayResolved,
		handleStockRejection,
		http,
		order,
		refetch,
		t,
	]);

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
		handleStockRejection,
	};
}
