import * as React from 'react';

import { requestStateManager } from '@wcpos/hooks/use-http-client';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { WebView } from '@wcpos/components/webview';
import { type EngineRecord, useDocField, useRecordField } from '@wcpos/query';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { awaitsStoredStatus } from '../sale-completion';
import { useSaleContext } from '../hooks/use-sale-context';
import { useAppState } from '../../../../../contexts/app-state';
import { useT } from '../../../../../contexts/translations';
import { useAccessTokenRefresher } from '../../../../../hooks/use-access-token-refresher';
import { useRestHttpClient } from '../../../hooks/use-rest-http-client';
import { judgeGatewaySnapshot } from '../pay-page/gateway-snapshot';
import { type PayPageMessage, readPayPageMessage } from '../pay-page/pay-page-message';
import { usePayFrame } from '../pay-page/use-pay-frame';
import { usePayPagePreparation } from '../pay-page/use-pay-page-preparation';
import { useSettleGatewaySnapshot } from '../pay-page/use-settle-gateway-snapshot';

import type { PaymentFrameStatus } from '../pay-page/use-pay-frame-gate';

// A pre-hardening store or an async gateway can report "not paid yet" while the
// provider's confirmation is still in flight. Re-read server truth on a short
// cadence — a webhook round-trip is seconds — but stop after a bound: past it the
// cart legitimately stays open for the cashier to decide, and the background
// order lanes (plus the Orders grid's per-order Sync) remain the long-tail net.
// Without the re-poll, a one-shot "still unpaid" answer left the paid order
// stuck as an open cart once the webhook landed a minute later.
const ASYNC_PAYMENT_POLL_INTERVAL_MS = 3_000;
const ASYNC_PAYMENT_POLL_WINDOW_MS = 120_000;

const paymentLogger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);

/** The catalog before it loads, and the prop default: no gateway has a stored status. */
const NO_SETTLED_ORDER_STATUSES: Record<string, string | null> = {};

export interface PaymentWebviewProps extends Partial<React.ComponentProps<typeof WebView>> {
	order: EngineRecord<'orders'>;
	/** `stage` when hosted in the wide checkout pane, where no checkout route exists to replace. */
	receiptHost?: 'modal' | 'stage';
	setLoading: React.Dispatch<React.SetStateAction<boolean>>;
	/** Reports frame readiness to the checkout footer, which gates on it. */
	setFrameStatus: (status: PaymentFrameStatus) => void;
	onStockRejection: (error: unknown) => boolean;
	/**
	 * Bumped by the checkout's Retry after a failed load: remounts the frame for
	 * one more attempt. A stall on that attempt is reported again, not retried
	 * silently — the cashier asked for it and is watching.
	 */
	retryToken?: number;
	/**
	 * The order status the merchant configured EACH gateway to settle a POS sale
	 * to (`settled_order_status` from the gateway catalog), keyed by gateway id;
	 * null for a gateway with nothing stored. Empty until the catalog has loaded,
	 * and on a store that predates the field. See isSettledOrderStatus.
	 *
	 * The whole catalog, not the opened gateway's entry: the pay page inside the
	 * frame lists every POS gateway, so the order can come back settled through a
	 * different one. A status is only honoured for the gateway it was stored for —
	 * the stored status of one must not close a sale taken through another.
	 */
	settledOrderStatuses?: Record<string, string | null>;
}

/**
 * The legacy pay page: composition of its preparation, frame and settle step, the
 * server-truth poll, and the session-expiry wiring over the frame.
 */
export function PaymentWebview({
	order,
	receiptHost = 'modal',
	setLoading,
	setFrameStatus,
	onStockRejection,
	retryToken = 0,
	settledOrderStatuses = NO_SETTLED_ORDER_STATUSES,
	...props
}: PaymentWebviewProps) {
	const ctx = useSaleContext();
	const orderData = useRecordField(order, (record) => record.payload);
	// Read through a ref, not the closure: the fallback poll re-arms itself with
	// the closure of the render it started in, and the gateway catalog can still
	// be loading at that moment. A later tick must see the catalog that arrived.
	const settledRef = React.useRef(settledOrderStatuses);
	React.useEffect(() => {
		settledRef.current = settledOrderStatuses;
	});
	const rawPaymentURL = orderData.links?.payment?.[0]?.href;
	const orderId = orderData.id;
	const orderNumber = orderData.number;
	const { wpCredentials } = useAppState();
	const jwt = useDocField(wpCredentials, (value) => value.access_token);
	const refreshAccessToken = useAccessTokenRefresher();
	const t = useT();
	const http = useRestHttpClient();
	const fallbackTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	// Set on unmount so a poll or a session refresh that is still awaiting a
	// response cannot settle the sale, or arm another poll, after checkout closed.
	const unmountedRef = React.useRef(false);
	// Ref-backed so a message arriving before the next render still sees the real count.
	const sessionReloadsRef = React.useRef(0);
	const sessionRefreshInFlight = React.useRef(false);
	// No further refresh may be attempted (the refresh token itself was rejected, or the cap
	// was reached); a transient failure (network, 5xx, cooldown) leaves it clear so a later
	// message may retry. The frame's own expiry is `usePayFrame`'s `expire`.
	const sessionRefreshRefused = React.useRef(false);

	// Create a logger with order context
	const orderLogger = React.useMemo(
		() =>
			paymentLogger.with({
				orderId: order.uuid,
				orderNumber,
			}),
		[order.uuid, orderNumber]
	);
	const { isSettled, settle } = useSettleGatewaySnapshot(order, receiptHost, orderLogger);

	// The "reopen the payment" warning is shown once per mount, whatever follows.
	const reopenWarned = React.useRef(false);
	const warnReopen = React.useCallback(() => {
		if (reopenWarned.current) return;
		reopenWarned.current = true;
		orderLogger.warn(t('pos_checkout.reopen_payment'), { showToast: true });
	}, [orderLogger, t]);

	const { prepared, paymentURL } = usePayPagePreparation({
		order,
		ctx,
		rawPaymentURL,
		retryToken,
		settledRef,
		logger: orderLogger,
	});

	/**
	 *
	 */
	const paymentURLWithToken = React.useMemo(() => {
		if (!paymentURL) return '';
		// Append the JWT token as a query parameter to the payment URL
		const url = new URL(paymentURL as string);
		url.searchParams.append('token', jwt);
		return url.toString();
	}, [paymentURL, jwt]);

	React.useEffect(() => {
		// A new token (this refresh or a background one) allows a refresh again.
		sessionRefreshRefused.current = false;
	}, [paymentURLWithToken]);

	// Pin the frame's message origin to the store: on web the shared WebView then drops
	// `message` events from any other window or origin (Pro posts with '*', which is the
	// sender's target; the receiver still sees the store's origin).
	const frameOrigin = React.useMemo(() => {
		try {
			return paymentURLWithToken ? new URL(paymentURLWithToken).origin : undefined;
		} catch {
			return undefined;
		}
	}, [paymentURLWithToken]);

	/**
	 * Read server truth once; with `pollUntilMs`, keep re-reading on the async cadence
	 * until the order is paid or the bound passes. Every not-yet-paid outcome — server
	 * unchanged, an unpaid transition, a transient request failure — re-arms; only a
	 * completed sale (here or via postMessage) settles it.
	 */
	const pollServerTruth = React.useCallback(
		async (pollUntilMs?: number): Promise<void> => {
			if (isSettled() || unmountedRef.current) return;
			const localPayload = order.getLatest().payload;
			const localStatus = localPayload.status;
			// The poll reconciles an open cart. The one other local state worth a
			// read is the gateway's stored status having already arrived through
			// background sync — the order is settled, but nothing has routed the
			// cashier off the pay window; the server read below closes it. Exactly
			// that status, for exactly that gateway: any other local status is a
			// sale this screen no longer owns (a partial tender, a sale settled by
			// someone else).
			const local = judgeGatewaySnapshot(localPayload, settledRef.current, ctx.dp);
			const localStored = local.storedStatus;
			const localAlreadySettled =
				typeof localStatus === 'string' &&
				localStored !== null &&
				localStatus === localStored &&
				local.complete;
			// Sync can land the stored status locally before the gateway catalog has
			// loaded, so nothing yet says it is settled. Returning here would skip the
			// re-arm in `finally`, and the catalog arriving later would find no poll
			// to close the pay window. Keep polling, bounded, while a payable local
			// status has no stored status to be judged against (the catalog has not
			// loaded, or stores none for this gateway); a later tick judges it.
			const localAwaitingCatalog =
				localStored === null && typeof localStatus === 'string' && awaitsStoredStatus(localStatus);
			if (
				!localStatus ||
				(localStatus !== 'pos-open' && !localAlreadySettled && !localAwaitingCatalog)
			) {
				return;
			}
			try {
				orderLogger.debug('No postMessage received, checking server order status', {
					context: { orderId },
				});
				// The decision reads SERVER truth directly (the sync surface's
				// include-read) — an engine require's `ready` can settle without
				// applying a newer revision to THIS document (skip-coalesced
				// resident tasks, dirty-row protection), so it cannot prove
				// payment state. The snapshot adoption in `settle` is the local
				// write; the engine refresh inside it is catch-up only.
				const response = await http.get('orders', {
					params: { include: orderId, per_page: 1 },
				});
				const serverOrder = response?.data?.[0] as Record<string, unknown> | undefined;
				if (!serverOrder || isSettled() || unmountedRef.current) return;
				const serverStatus = serverOrder.status as string;
				// Unchanged from the open cart: nothing to reconcile. (When the local
				// copy already carries the settled status, "unchanged" IS the outcome.)
				if (serverStatus === localStatus && !localAlreadySettled) return;
				// A status change is not a payment: an unpaid transition leaves everything in
				// place (the finally releases the spinner) so the cashier can retry from the
				// cart they still have — unless it is the status the merchant configured the
				// gateway to settle on, which is the sale finishing.
				const server = judgeGatewaySnapshot(serverOrder, settledRef.current, ctx.dp);
				if (!server.complete) {
					orderLogger.debug('Server order status changed but is not paid; leaving the cart open', {
						context: {
							serverStatus,
							settledOrderStatus: server.storedStatus,
							source: 'fallback-refresh',
						},
					});
					return;
				}
				await settle(server, 'fallback-refresh');
			} catch (err) {
				// Best-effort safety net only. Order completion is authoritatively
				// delivered via the postMessage path, so a failed or premature poll
				// (order not queryable yet or a transient sync error) is
				// expected and must NOT be surfaced as a payment-gateway failure —
				// doing so produced spurious PY02001 errors on successful checkouts.
				orderLogger.debug('Fallback order status refresh did not complete', {
					context: {
						error: getErrorMessage(err),
						source: 'fallback-refresh',
					},
				});
			} finally {
				setLoading(false);
				if (
					!isSettled() &&
					!unmountedRef.current &&
					pollUntilMs !== undefined &&
					Date.now() < pollUntilMs
				) {
					if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
					fallbackTimerRef.current = setTimeout(
						() => void pollServerTruth(pollUntilMs),
						ASYNC_PAYMENT_POLL_INTERVAL_MS
					);
				}
			}
		},
		[http, order, orderId, ctx.dp, settle, isSettled, setLoading, orderLogger]
	);

	/**
	 * A later document loaded: schedule a fallback refresh in case the payment
	 * gateway doesn't send a postMessage.
	 */
	const onLaterDocument = React.useCallback(() => {
		if (fallbackTimerRef.current) {
			clearTimeout(fallbackTimerRef.current);
		}
		fallbackTimerRef.current = setTimeout(
			() => void pollServerTruth(Date.now() + ASYNC_PAYMENT_POLL_WINDOW_MS),
			1000
		);
	}, [pollServerTruth]);
	const frame = usePayFrame({
		src: paymentURLWithToken,
		retryToken,
		prepared,
		report: setFrameStatus,
		onLaterDocument,
		logger: orderLogger,
	});

	const handleSessionExpired = async (messageOrderId: number) => {
		if (messageOrderId !== orderId) {
			orderLogger.debug('Ignoring session expiry for another order');
			return;
		}
		if (sessionRefreshInFlight.current || sessionRefreshRefused.current) return;
		if (sessionReloadsRef.current >= 2) {
			// The reloaded frame expired again: close the gate so nothing submits to it.
			sessionRefreshRefused.current = true;
			frame.expire();
			warnReopen();
			return;
		}
		sessionRefreshInFlight.current = true;
		frame.hold();
		try {
			const token = await refreshAccessToken();
			if (unmountedRef.current) return;
			if (token) {
				sessionReloadsRef.current += 1;
				frame.remount();
				// The remount resets the load count, so its first load never arms the poll.
				// Still detect a payment that settled during the refresh.
				void pollServerTruth(Date.now() + ASYNC_PAYMENT_POLL_WINDOW_MS);
			} else {
				sessionRefreshRefused.current = requestStateManager.isAuthFailed();
				frame.expire();
				warnReopen();
			}
		} finally {
			sessionRefreshInFlight.current = false;
			frame.release();
			setLoading(false);
		}
	};

	const handleReceived = async (
		message: Extract<PayPageMessage, { kind: 'received' | 'received-unreadable' }>
	) => {
		// The fallback poll may have settled this sale first; a late message
		// for the same order must not route and toast a second time.
		if (isSettled()) return;
		// Both deferrals below arm the server-truth poll, which completes the sale:
		// lifecycle, not an amber row on a sale that finishes normally.
		if (message.kind === 'received-unreadable') {
			orderLogger.info('Payment received with an invalid order snapshot', {
				context: { orderId },
			});
			setLoading(false);
			void pollServerTruth(Date.now() + ASYNC_PAYMENT_POLL_WINDOW_MS);
			return;
		}
		// A pre-hardening store's received page emits whenever the CONFIGURED
		// gateway status is not pos-open — for an async gateway that can be
		// before the provider confirms, with the order still unpaid. Don't
		// complete on the message's say-so: leave the poll armed and let
		// server truth decide. The exception is the status the merchant
		// configured this gateway to settle on — reaching it IS the sale
		// finishing, whatever WooCommerce calls it.
		const judged = judgeGatewaySnapshot(message.snapshot, settledRef.current, ctx.dp);
		if (!judged.complete) {
			orderLogger.info('Payment received but the order is not paid; deferring to server truth', {
				context: {
					orderId,
					status: message.snapshot.status,
					settledOrderStatus: judged.storedStatus,
				},
			});
			setLoading(false);
			void pollServerTruth(Date.now() + ASYNC_PAYMENT_POLL_WINDOW_MS);
			return;
		}
		if (fallbackTimerRef.current) {
			clearTimeout(fallbackTimerRef.current);
			fallbackTimerRef.current = null;
		}
		try {
			await settle(judged, 'pay-page-message');
		} finally {
			setLoading(false);
		}
	};

	const onMessage = (event: { nativeEvent: { data: unknown } }) => {
		const message = readPayPageMessage(event?.nativeEvent?.data);
		switch (message.kind) {
			case 'session-expired':
				void handleSessionExpired(message.orderId);
				return;
			case 'blocked':
			case 'refused':
				if (onStockRejection(message.payload)) {
					setLoading(false);
					return;
				}
				setLoading(false);
				// The gateway refused (a decline, a missing field): no money moved and
				// the cart is safe to retry. Its own sentence is the toast title — the
				// generic PAYMENT999 "confirm whether the payment went through" was
				// wrong for a sale that plainly did not go through.
				orderLogger.warn('Payment was not completed by the gateway', {
					showToast: true,
					code: ERROR_CODES.CHECKOUT_FAILED_CART_SAFE,
					toast: { title: message.message ?? t('pos_checkout.payment_not_completed') },
					context: {
						gatewayMessage: message.message,
						payloadData: message.payload.data,
						action: message.action,
					},
				});
				return;
			case 'received':
			case 'received-unreadable':
				void handleReceived(message);
				return;
			case 'ignored':
				return;
			default:
				return message satisfies never;
		}
	};

	// A layout effect: its cleanup runs in the commit that removes the frame, so a
	// poll response arriving before the passive cleanups flush already sees the flag.
	React.useLayoutEffect(() => {
		unmountedRef.current = false;
		return () => {
			unmountedRef.current = true;
			if (fallbackTimerRef.current) {
				clearTimeout(fallbackTimerRef.current);
			}
		};
	}, []);

	// The key sits on the boundary, not the frame: a WebView that threw while
	// mounting leaves the boundary in its fallback, and re-keying a child inside
	// a fallback mounts nothing. A retry has to reset both.
	return (
		<ErrorBoundary key={frame.key}>
			{paymentURL ? (
				<WebView
					{...(props as React.ComponentProps<typeof WebView>)}
					src={paymentURLWithToken}
					targetOrigin={frameOrigin}
					{...frame.handlers}
					onMessage={onMessage}
					className="h-full flex-1"
				/>
			) : null}
		</ErrorBoundary>
	);
}
