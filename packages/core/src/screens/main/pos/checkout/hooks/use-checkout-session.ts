import * as React from 'react';

import { isExpectedPreflightBlock } from '@wcpos/hooks/use-http-client/is-expected-preflight-block';
import { type EngineRecord, useQueryRuntime, useRecordField } from '@wcpos/query';
import { remoteIdOrNull } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../../../contexts/translations';
import {
	PaymentGatewayContract,
	supportsCheckoutContract,
} from '../../../hooks/payment-gateway-contract';
import { useRestHttpClient } from '../../../hooks/use-rest-http-client';
import { usePaymentGateways } from '../../../hooks/use-payment-gateways';
import { useStorageMoneyPathGuard } from '../../../hooks/use-storage-health';
import {
	clearStockRejection,
	parseInsufficientStockError,
	setStockRejection,
	stockRejection$,
} from '../../hooks/stock-rejection';
import { useCartStockGuard } from '../../hooks/use-cart-stock-guard';
import { useCompleteOrderFlow } from './use-complete-order-flow';

const checkoutLogger = getLogger(['wcpos', 'pos', 'checkout', 'contract']);

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

export function useCheckoutSession(order: EngineRecord<'orders'>) {
	const http = useRestHttpClient();
	const runtime = useQueryRuntime();
	const t = useT();
	const { resolveStockOwnerId } = useCartStockGuard();
	const { blockIfDegraded } = useStorageMoneyPathGuard();
	const [loading, setLoading] = React.useState(false);
	// Error raised by the checkout flow itself (set imperatively in handlers).
	const [checkoutError, setError] = React.useState<string | null>(null);
	const checkoutAttemptIdRef = React.useRef<string | null>(null);
	const orderData = useRecordField(order, (record) => record.payload);
	const orderId = orderData.id;
	const orderNumber = orderData.number;
	const completeOrderFlow = useCompleteOrderFlow(order);

	const gatewayId = React.useMemo(
		() => orderData.payment_method || 'pos_cash',
		[orderData.payment_method]
	);
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
	}, [gatewayId, orderId]);

	const handleStockRejection = React.useCallback(
		(error: unknown) => {
			const rejectedItems = parseInsufficientStockError(error);
			if (!rejectedItems) return false;

			const rejection = { orderUuid: order.uuid ?? '', items: rejectedItems };
			setStockRejection(rejection);
			checkoutAttemptIdRef.current = null;
			setError('insufficient_stock');
			const productIds = [...new Set(rejectedItems.map((item) => item.product_id))];
			const variationIds = [
				...new Set(rejectedItems.map((item) => item.variation_id).filter(Boolean)),
			];
			const refreshes: Promise<void>[] = [];
			for (const [collection, wooIds] of [
				['products', productIds],
				['variations', variationIds],
			] as const) {
				if (wooIds.length === 0) continue;
				const handle = runtime.engine.require({
					id: `checkout:stock-rejection:${collection}:${orderId}`,
					collection,
					kind: 'targeted-records',
					remoteIds: wooIds.map(remoteIdOrNull).filter((remoteId) => remoteId !== null),
					forceRefresh: true,
				});
				refreshes.push(
					handle.ready
						.then(
							() => undefined,
							() => undefined
						)
						.finally(() => handle.release())
				);
			}
			void Promise.all(refreshes)
				.then(() =>
					Promise.all(
						rejectedItems.map(async (item) => ({
							...item,
							stock_owner_id: await resolveStockOwnerId(item.product_id, item.variation_id),
						}))
					)
				)
				.then((items) => {
					if (stockRejection$.getValue() === rejection) {
						setStockRejection({ ...rejection, items });
					}
				})
				.catch(() => undefined);
			return true;
		},
		[runtime, orderId, order.uuid, resolveStockOwnerId]
	);

	const startCheckout = React.useCallback(async () => {
		if (!orderId || !gatewayResolved) return;
		if (blockIfDegraded('process-payment', { orderId: orderId })) return;
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
				context: { order_id: orderId },
			});

			// Last point at which no money has moved (#163 ruling R5). The gateway
			// refetch and the bootstrap POST above are both awaits the worker can die
			// under, so re-read the latch here rather than trusting the check made
			// when Process Payment was pressed. Past this POST the payment is with
			// the gateway and the client cannot recall it — see the PR body.
			if (blockIfDegraded('process-payment', { orderId: orderId })) return;

			const response = await http.post(
				`orders/${orderId}/checkout`,
				{
					gateway_id: resolvedGateway.id,
					action: 'start',
					payment_data: {},
				},
				{
					headers: {
						'X-WCPOS-Idempotency-Key': createCheckoutIdempotencyKey(
							orderId,
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
				const poll = await http.get(`orders/${orderId}/checkout`);
				state = (poll?.data || {}) as CheckoutState;
			}

			checkoutAttemptIdRef.current = null;

			if (state.status === 'completed') {
				clearStockRejection();
				checkoutLogger.success(
					t('pos_checkout.payment_completed_for_order', {
						orderNumber: orderNumber,
					}),
					{
						showToast: true,
						context: {
							orderId: orderId,
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
			const logLevel = isExpectedPreflightBlock(err) ? 'warn' : 'error';
			checkoutLogger[logLevel](message, {
				showToast: true,
				code: ERROR_CODES.CHECKOUT_OUTCOME_UNKNOWN,
				context: {
					orderId: orderId,
					gatewayId: resolvedGateway?.id,
				},
			});
		} finally {
			setLoading(false);
		}
	}, [
		blockIfDegraded,
		completeOrderFlow,
		gateway,
		gatewayId,
		gatewayResolved,
		handleStockRejection,
		http,
		orderId,
		orderNumber,
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
