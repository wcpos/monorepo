import * as React from 'react';

import { useRouter } from 'expo-router';

import { isExpectedPreflightBlock } from '@wcpos/hooks/use-http-client/is-expected-preflight-block';
import { type EngineRecord, useQueryRuntime, useRecordField } from '@wcpos/query';
import { remoteIdOrNull } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';
import {
	ERROR_CATALOGUE,
	ERROR_CODES,
	type ErrorCode,
} from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../../../contexts/translations';
import {
	PaymentGatewayContract,
	supportsCheckoutContract,
} from '../../../hooks/payment-gateway-contract';
import { useUISettings } from '../../../contexts/ui-settings';
import { useRestHttpClient } from '../../../hooks/use-rest-http-client';
import { usePaymentGateways } from '../../../hooks/use-payment-gateways';
import { useStockAdjustment } from '../../../hooks/use-stock-adjustment';
import { useStorageMoneyPathGuard } from '../../../hooks/use-storage-health';
import {
	clearStockRejection,
	parseInsufficientStockError,
	setStockRejection,
	stockRejection$,
} from '../../hooks/stock-rejection';
import { useCartStockGuard } from '../../hooks/use-cart-stock-guard';
import { refreshOrderBounded } from '../bounded-order-refresh';

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

/**
 * How far a contract checkout got before it failed — which decides what the
 * cashier is told. Only a failure after the start request was sent can leave the
 * outcome unknown; before that nothing was charged.
 */
type CheckoutPhase = 'bootstrap' | 'start' | 'poll' | 'settled' | 'completed';

interface CheckoutFailureReport {
	level: 'info' | 'warn' | 'error';
	/** Absent for a benign outcome (backgrounded before anything was sent). */
	code?: ErrorCode;
	/** Already-translated toast title, when the code's summary is not the sentence. */
	title?: string;
	/** Already-translated second line, when the code's hint would mislead. */
	text2?: string;
}

function serverSentence(error: unknown): string | undefined {
	const message = (error as { wpMessage?: unknown } | null)?.wpMessage;
	return typeof message === 'string' && message.trim() !== '' ? message : undefined;
}

/**
 * The one row and toast for a failed contract checkout. Exported for tests.
 *
 * - offline before the start was sent: nothing was charged (SYNC121, warn);
 * - the gateway setup or the store refusing the start: the cart is safe (CHECKOUT101),
 *   with the store's own sentence;
 * - the gateway answering `failed`/`cancelled`: not paid, cart safe (CHECKOUT101, warn);
 * - paid, but the follow-up (routing, local refresh) threw: PAYMENT101, warn;
 * - the start sent but its reply lost, or the poll giving up: the outcome is genuinely
 *   unknown (CHECKOUT201, "check before charging again").
 */
export function classifyCheckoutFailure(
	error: unknown,
	phase: CheckoutPhase,
	t: (key: string, options?: Record<string, unknown>) => string,
	providerMessage?: string
): CheckoutFailureReport {
	if (phase === 'completed') {
		return { level: 'warn', code: ERROR_CODES.PAYMENT_OK_STATUS_CHECK_FAILED };
	}
	// A preflight block means the request never left — but only the bootstrap and
	// the start can be the request that charges. Offline mid-poll is outcome-unknown.
	const notSent = isExpectedPreflightBlock(error) && (phase === 'bootstrap' || phase === 'start');
	// Backgrounded (the tab was hidden), not offline: nothing is wrong with the
	// connection, so no "you're offline" and no code — just try again.
	if (notSent && (error as { isSleeping?: unknown } | null)?.isSleeping === true) {
		return {
			level: 'info',
			title: t('pos_checkout.background_nothing_charged'),
			text2: t('common.try_again_now'),
		};
	}
	if (notSent) {
		return {
			level: 'warn',
			code: ERROR_CODES.SYNC_UNREACHABLE,
			title: t('pos_checkout.offline_nothing_charged'),
			// SYNC121's "changes send automatically" is not true of a payment.
			text2: t('common.reconnect_then_retry'),
		};
	}
	// The auth handler turns a refused (401) bootstrap/start into a CanceledError while
	// it launches sign-in: the store refused it, so nothing was charged.
	const cancelled =
		(error as { code?: unknown } | null)?.code === 'ERR_CANCELED' ||
		(error as { name?: unknown } | null)?.name === 'CanceledError';
	if (cancelled && (phase === 'bootstrap' || phase === 'start')) {
		return {
			level: 'warn',
			code: ERROR_CODES.SESSION_EXPIRED,
			title: t('pos_checkout.sign_in_nothing_charged'),
		};
	}
	if (phase === 'settled') {
		return {
			level: 'warn',
			code: ERROR_CODES.CHECKOUT_FAILED_CART_SAFE,
			title: providerMessage ?? t('pos_checkout.payment_not_completed'),
		};
	}
	const status = (error as { response?: { status?: number } } | null)?.response?.status;
	// 408/409/429: the start may still be processing (or retried by the store), so a
	// retry — which gets a fresh idempotency key after a remount — could charge twice.
	const refused =
		typeof status === 'number' &&
		status >= 400 &&
		status < 500 &&
		status !== 408 &&
		status !== 409 &&
		status !== 429;
	if (phase === 'bootstrap' || (phase === 'start' && refused)) {
		// A refusal the HTTP client mapped to a WordPress code (403 rest_cannot_create →
		// AUTH201, a missing route → its own code) keeps that code at its severity; the
		// generic "cart is safe, retry" only when there is none.
		const wpCode = refused ? (error as { wpCode?: ErrorCode } | null)?.wpCode : undefined;
		const code = wpCode ?? ERROR_CODES.CHECKOUT_FAILED_CART_SAFE;
		return {
			level: ERROR_CATALOGUE[code].severity === 'error' ? 'error' : 'warn',
			code,
			title: serverSentence(error),
		};
	}
	return { level: 'error', code: ERROR_CODES.CHECKOUT_OUTCOME_UNKNOWN };
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
	const { stockAdjustment } = useStockAdjustment();
	const { uiSettings } = useUISettings('pos-cart');
	const router = useRouter();
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

	const gatewayId = React.useMemo(
		() => orderData.payment_method || 'pos_cash',
		[orderData.payment_method]
	);
	const {
		gateways,
		gateway,
		loading: gatewayLoading,
		error: gatewayError,
		refetch,
	} = usePaymentGateways(gatewayId);
	const gatewayResolved = !gatewayLoading;
	// Every gateway's stored settled status, keyed by id. The pay page inside the
	// legacy webview lists every POS gateway, so the order can settle through one
	// other than the gateway this cart was opened with; the webview must be able
	// to judge whichever gateway the order comes back carrying.
	const settledOrderStatuses = React.useMemo(
		() =>
			Object.fromEntries(
				gateways.map((item) => [item.id, item.settled_order_status ?? null] as const)
			),
		[gateways]
	);

	// The displayed error is the gateway fetch error (derived from the gateways
	// hook) when present, otherwise the checkout flow's own error. Derived during
	// render rather than synced into state via an effect.
	const error = gatewayError ? 'payment_gateways_fetch_failed' : checkoutError;

	React.useEffect(() => {
		checkoutAttemptIdRef.current = null;
	}, [gatewayId, orderId]);

	const completeOrderFlow = React.useCallback(async () => {
		if (!orderId) {
			throw new Error('checkout_refresh_requires_persisted_order');
		}
		// Route FIRST; the local refresh is catch-up, never a gate (#1685). The
		// receipt binds the order by uuid and fetches its own receipt data, so it
		// does not need the refresh to have landed.
		if (uiSettings.autoShowReceipt) {
			router.replace({
				pathname: '/(app)/(drawer)/(pos)/(modals)/cart/receipt/[orderId]',
				params: { orderId: order.uuid! },
			});
		} else {
			router.replace({ pathname: '/cart' });
		}

		await refreshOrderBounded(runtime.engine, orderId);

		const latest = order.getLatest().payload;
		const reducedStockItems = (latest.line_items || []).filter((item) =>
			(item.meta_data as { key: string }[] | undefined)?.some(
				(meta) => meta.key === '_reduced_stock'
			)
		);
		stockAdjustment(reducedStockItems);
	}, [runtime, order, orderId, router, stockAdjustment, uiSettings.autoShowReceipt]);

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

		let phase: CheckoutPhase = 'bootstrap';
		let providerMessage: string | undefined;
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

			phase = 'start';
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
			phase = 'poll';
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
				phase = 'completed';
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

			// A definitive `failed`/`cancelled` is the store saying "not paid". Any other
			// terminal answer stays outcome-unknown.
			if (state.status === 'failed' || state.status === 'cancelled') {
				phase = 'settled';
				const message = state.provider_data?.message;
				providerMessage =
					typeof message === 'string' && message.trim() !== '' ? message : undefined;
			}
			throw new Error(state.status || 'checkout_failed');
		} catch (err) {
			if (handleStockRejection(err)) return;
			const message = err instanceof Error ? err.message : 'checkout_failed';
			setError(message);
			const report = classifyCheckoutFailure(err, phase, t, providerMessage);
			const options = {
				showToast: true,
				...(report.title !== undefined || report.text2 !== undefined
					? {
							toast: {
								...(report.title !== undefined && { title: report.title }),
								...(report.text2 !== undefined && { text2: report.text2 }),
							},
						}
					: {}),
				context: {
					orderId: orderId,
					gatewayId: resolvedGateway?.id,
					phase,
					status: (err as { response?: { status?: number } } | null)?.response?.status,
				},
			};
			const logMessage = `Contract checkout failed: ${message}`;
			if (report.code === undefined) {
				checkoutLogger.info(logMessage, options);
			} else {
				checkoutLogger[report.level === 'error' ? 'error' : 'warn'](logMessage, {
					...options,
					code: report.code,
				});
			}
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
		settledOrderStatuses,
		mode,
		startCheckout,
		handleStockRejection,
	};
}
