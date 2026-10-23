import * as React from 'react';

import { requestStateManager } from '@wcpos/hooks/use-http-client';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { WebView } from '@wcpos/components/webview';
import { type EngineRecord, useDocField, useRecordField } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useSaleContext } from '../hooks/use-sale-context';
import { useAppState } from '../../../../../contexts/app-state';
import { useT } from '../../../../../contexts/translations';
import { useAccessTokenRefresher } from '../../../../../hooks/use-access-token-refresher';
import { useRestHttpClient } from '../../../hooks/use-rest-http-client';
import { judgeGatewaySnapshot } from '../pay-page/gateway-snapshot';
import { type PayPageMessage, readPayPageMessage } from '../pay-page/pay-page-message';
import { usePayFrame } from '../pay-page/use-pay-frame';
import { usePayPagePreparation } from '../pay-page/use-pay-page-preparation';
import { useServerTruthPoll } from '../pay-page/use-server-truth-poll';
import { useSettleGatewaySnapshot } from '../pay-page/use-settle-gateway-snapshot';

import type { PaymentFrameStatus } from '../pay-page/use-pay-frame-gate';

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
	// Set on unmount so a session refresh still awaiting a response cannot remount the
	// frame, or start the poll, after checkout closed.
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

	const { poll, stop } = useServerTruthPoll({
		http,
		order,
		orderId,
		settledRef,
		dp: ctx.dp,
		settle,
		isSettled,
		setLoading,
		logger: orderLogger,
	});
	// A later document loaded: check server truth in case the gateway never posts a message.
	const onLaterDocument = React.useCallback(() => poll(1000), [poll]);
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
				poll();
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
			poll();
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
			poll();
			return;
		}
		stop();
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
	// refresh answer arriving before the passive cleanups flush already sees the flag.
	React.useLayoutEffect(() => {
		unmountedRef.current = false;
		return () => {
			unmountedRef.current = true;
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
