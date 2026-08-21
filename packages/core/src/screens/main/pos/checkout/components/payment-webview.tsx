import * as React from 'react';

import { useRouter } from 'expo-router';
import { useObservableState } from 'observable-hooks';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { WebView } from '@wcpos/components/webview';
import { type EngineRecord, useQueryRuntime, useRecordField } from '@wcpos/query';
import { remoteIdOrNull } from '@wcpos/sync-core';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useAppState } from '../../../../../contexts/app-state';
import { useT } from '../../../../../contexts/translations';
import { useUISettings } from '../../../contexts/ui-settings';
import { useRestHttpClient } from '../../../hooks/use-rest-http-client';
import { useStockAdjustment } from '../../../hooks/use-stock-adjustment';

const paymentLogger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);

/**
 * Whether the store's payment document is in a position to receive
 * `wcpos-process-payment`.
 *
 * - `loading` — no document yet, or the frame is navigating to a new one.
 * - `ready` — a document finished loading in the frame.
 * - `failed` — the load errored, so no load event is coming. Distinct from
 *   `loading` because a gate with no failure state leaves the button disabled
 *   behind a spinner forever, which is the very stall this gate exists to stop.
 */
export type PaymentFrameStatus = 'loading' | 'ready' | 'failed';

export interface PaymentWebviewProps extends Partial<React.ComponentProps<typeof WebView>> {
	order: EngineRecord<'orders'>;
	setLoading: React.Dispatch<React.SetStateAction<boolean>>;
	/** Reports frame readiness to the checkout footer, which gates on it. */
	setFrameStatus: (status: PaymentFrameStatus) => void;
	onStockRejection: (error: unknown) => boolean;
}

/**
 *
 */
export function PaymentWebview({
	order,
	setLoading,
	setFrameStatus,
	onStockRejection,
	...props
}: PaymentWebviewProps) {
	const router = useRouter();
	const orderData = useRecordField(order, (record) => record.payload);
	const paymentURL = orderData.links?.payment?.[0]?.href;
	const orderId = orderData.id;
	const orderNumber = orderData.number;
	const { wpCredentials } = useAppState();
	const jwt = useObservableState(wpCredentials.access_token$, wpCredentials.access_token);
	const { stockAdjustment } = useStockAdjustment();
	const { uiSettings } = useUISettings('pos-cart');
	const t = useT();
	const runtime = useQueryRuntime();
	const http = useRestHttpClient();
	const paymentReceivedRef = React.useRef(false);
	const fallbackTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const loadCountRef = React.useRef(0);

	// Create a logger with order context
	const orderLogger = React.useMemo(
		() =>
			paymentLogger.with({
				orderId: order.uuid,
				orderNumber,
			}),
		[order.uuid, orderNumber]
	);

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

	const refreshOrder = React.useCallback(async () => {
		if (!orderId) {
			throw new Error('payment_refresh_requires_persisted_order');
		}
		const handle = runtime.engine.require({
			id: `checkout:order-refresh:${orderId}`,
			collection: 'orders',
			kind: 'targeted-records',
			remoteIds: [orderId].map(remoteIdOrNull).filter((remoteId) => remoteId !== null),
			forceRefresh: true,
		});
		try {
			await handle.ready;
		} finally {
			handle.release();
		}
	}, [runtime, orderId]);

	/**
	 *
	 */
	const handlePaymentReceived = React.useCallback(
		async (event: MessageEvent) => {
			if (
				event?.data?.action === 'wcpos-payment-received' &&
				typeof event?.data?.payload === 'object'
			) {
				try {
					paymentReceivedRef.current = true;
					if (fallbackTimerRef.current) {
						clearTimeout(fallbackTimerRef.current);
						fallbackTimerRef.current = null;
					}
					const payload = event.data.payload;
					// get line_items with "_reduced_stock" meta
					const reducedStockItems = (payload?.line_items || []).filter(
						(item: Record<string, unknown>) =>
							(item.meta_data as { key: string }[])?.some(
								(meta: { key: string }) => meta.key === '_reduced_stock'
							)
					);
					stockAdjustment(reducedStockItems);

					orderLogger.success(
						t('pos_checkout.payment_completed_for_order', {
							orderNumber: payload.number || orderNumber,
						}),
						{
							showToast: true,
							context: {
								total: payload.total,
								paymentMethod: payload.payment_method,
								paymentMethodTitle: payload.payment_method_title,
								transactionId: payload.transaction_id,
								status: payload.status,
							},
						}
					);
					await refreshOrder();

					if (uiSettings.autoShowReceipt) {
						router.replace({
							pathname: '/(app)/(drawer)/(pos)/(modals)/cart/receipt/[orderId]',
							params: { orderId: order.uuid },
						});
					} else {
						router.replace({
							pathname: '/cart',
						});
					}
				} catch (err) {
					const errorMessage = err instanceof Error ? err.message : 'Payment processing error';
					orderLogger.error(errorMessage, {
						showToast: true,
						code: ERROR_CODES.PAYMENT_OK_STATUS_CHECK_FAILED,
						context: {
							error: getErrorMessage(err),
						},
					});
				} finally {
					setLoading(false);
				}
			}
		},
		[
			orderNumber,
			router,
			order,
			stockAdjustment,
			uiSettings.autoShowReceipt,
			setLoading,
			orderLogger,
			t,
			refreshOrder,
		]
	);

	/**
	 * When the webview loads, schedule a fallback refresh in case the payment
	 * gateway doesn't send a postMessage.
	 *
	 * The first load is the initial order-pay page, where a payment cannot have
	 * completed yet — there is nothing to reconcile. We only poll on later
	 * navigations (e.g. the post-payment redirect to the received page) where a
	 * missed postMessage is actually possible. Polling on the initial load only
	 * fires a request that races ahead of the payment and can never observe a
	 * completed sale.
	 */
	const onWebViewLoaded = React.useCallback(
		(_event: unknown) => {
			// The store's order-pay template registers its `wcpos-process-payment`
			// listener in a synchronous <head> script, so the frame's load event is
			// strictly after that listener exists. It is the strongest readiness
			// signal either platform exposes — the template sends no ready message —
			// so the checkout footer gates on it (#1024).
			setFrameStatus('ready');

			loadCountRef.current += 1;
			if (loadCountRef.current < 2) {
				return;
			}

			if (fallbackTimerRef.current) {
				clearTimeout(fallbackTimerRef.current);
			}

			const checkFallback = async () => {
				if (paymentReceivedRef.current) return;

				// Check local status first - if it's no longer pos-open,
				// the postMessage path already handled the update
				const localStatus = order.getLatest().payload.status;
				if (!localStatus || localStatus !== 'pos-open') return;

				try {
					orderLogger.debug('No postMessage received, checking server order status', {
						context: { orderId },
					});

					// The decision reads SERVER truth directly (the sync surface's
					// include-read) — an engine require's `ready` can settle without
					// applying a newer revision to THIS document (skip-coalesced
					// resident tasks, dirty-row protection), so it cannot prove
					// payment state. The engine refresh below is local catch-up only.
					const response = await http.get('orders', {
						params: { include: orderId, per_page: 1 },
					});
					const serverOrder = response?.data?.[0] as Record<string, unknown> | undefined;
					if (!serverOrder) return;
					const serverStatus = serverOrder.status as string;

					// If server still matches local, payment hasn't completed yet
					if (serverStatus === localStatus) return;

					paymentReceivedRef.current = true;

					// Best-effort: bring the local document up to date; routing below
					// does not depend on it.
					void refreshOrder().catch(() => undefined);

					const reducedStockItems = (
						(serverOrder.line_items as Record<string, unknown>[]) || []
					).filter((item) =>
						(item.meta_data as { key: string }[] | undefined)?.some(
							(meta) => meta.key === '_reduced_stock'
						)
					);
					stockAdjustment(reducedStockItems);

					orderLogger.success(
						t('pos_checkout.payment_completed_for_order', {
							orderNumber: (serverOrder.number as string) || orderNumber,
						}),
						{
							showToast: true,
							context: {
								total: serverOrder.total,
								paymentMethod: serverOrder.payment_method,
								paymentMethodTitle: serverOrder.payment_method_title,
								status: serverStatus,
								source: 'fallback-refresh',
							},
						}
					);

					if (uiSettings.autoShowReceipt) {
						router.replace({
							pathname: '/(app)/(drawer)/(pos)/(modals)/cart/receipt/[orderId]',
							params: { orderId: order.uuid },
						});
					} else {
						router.replace({ pathname: '/cart' });
					}
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
				}
			};
			fallbackTimerRef.current = setTimeout(() => void checkFallback(), 1000);
		},
		[
			http,
			order,
			orderId,
			orderNumber,
			stockAdjustment,
			uiSettings.autoShowReceipt,
			router,
			setLoading,
			setFrameStatus,
			orderLogger,
			t,
			refreshOrder,
		]
	);

	/**
	 * Navigating away — a gateway redirect, the post-payment hop — puts a document
	 * under the frame that has no `wcpos-process-payment` listener until it, too,
	 * has loaded. Re-gate so a second press cannot post into it.
	 *
	 * Native only: the web WebView renders an <iframe>, which exposes no
	 * navigation-start event for a cross-origin document. Passing the prop there
	 * is inert. That residual web gap is one of the reasons a store-side ack is
	 * the real fix rather than this gate.
	 */
	const onWebViewLoadStart = React.useCallback(() => {
		setFrameStatus('loading');
	}, [setFrameStatus]);

	/**
	 * A load that errors produces no load event, so the gate has to be told or it
	 * stays shut forever. Native surfaces this reliably; on web an <iframe> only
	 * fires `error` for a hard failure (a 404 *page* still loads), which is one
	 * more reason the honest readiness signal has to come from the store.
	 */
	const onWebViewError = React.useCallback(
		(event: unknown) => {
			setFrameStatus('failed');
			const nativeEvent = (event as { nativeEvent?: Record<string, unknown> } | undefined)
				?.nativeEvent;
			orderLogger.warn('Payment form failed to load in the checkout frame', {
				context: {
					description: nativeEvent?.description,
					code: nativeEvent?.code,
				},
			});
		},
		[orderLogger, setFrameStatus]
	);

	/**
	 * A new payment URL swaps the document under the frame, so the gate closes
	 * until the replacement reports its own load. The unmount cleanup means a
	 * remounted frame (mode change, stock rejection cleared) never starts open.
	 *
	 * The load counter resets with it: the fallback poll deliberately skips the
	 * *first* load because a payment cannot have completed yet, and a re-hosted
	 * document is a first load, not a post-payment navigation.
	 *
	 * `useLayoutEffect`, not `useEffect`: the new `src` is committed to the DOM in
	 * the same commit, and a passive effect would leave the gate reporting `ready`
	 * against the replacement document until after paint — a window in which a
	 * press posts into a document that is still loading. This closes it before the
	 * cashier can see, let alone touch, the frame.
	 */
	React.useLayoutEffect(() => {
		loadCountRef.current = 0;
		setFrameStatus('loading');
		return () => setFrameStatus('loading');
	}, [paymentURLWithToken, setFrameStatus]);

	React.useEffect(() => {
		return () => {
			if (fallbackTimerRef.current) {
				clearTimeout(fallbackTimerRef.current);
			}
		};
	}, []);

	return (
		<ErrorBoundary>
			{paymentURL ? (
				<WebView
					{...(props as React.ComponentProps<typeof WebView>)}
					src={paymentURLWithToken}
					onLoad={onWebViewLoaded}
					onLoadStart={onWebViewLoadStart}
					onError={onWebViewError}
					onMessage={(event) => {
						const data = event?.nativeEvent?.data as Record<string, unknown> | undefined;
						const payload = data?.payload as Record<string, unknown> | undefined;
						if (payload?.data) {
							if (onStockRejection(payload)) {
								setLoading(false);
								return;
							}
							orderLogger.error((payload?.message as string) || 'Payment error', {
								showToast: true,
								code: ERROR_CODES.PAYMENT_UNEXPECTED,
								context: {
									payloadData: payload?.data,
								},
							});
						} else {
							void handlePaymentReceived({ data } as unknown as MessageEvent);
						}
					}}
					className="h-full flex-1"
				/>
			) : null}
		</ErrorBoundary>
	);
}
