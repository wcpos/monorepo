import * as React from 'react';

import { useRouter } from 'expo-router';
import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { WebView } from '@wcpos/components/webview';
import { useQueryManager } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useAppState } from '../../../../../contexts/app-state';
import { useT } from '../../../../../contexts/translations';
import { useUISettings } from '../../../contexts/ui-settings';
import { useRestHttpClient } from '../../../hooks/use-rest-http-client';
import { useStockAdjustment } from '../../../hooks/use-stock-adjustment';

const paymentLogger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);

type OrderDocument = import('@wcpos/database').OrderDocument;

export interface PaymentWebviewProps extends Partial<React.ComponentProps<typeof WebView>> {
	order: OrderDocument;
	setLoading: React.Dispatch<React.SetStateAction<boolean>>;
	onCheckoutError?: (error: unknown) => boolean;
}

/**
 *
 */
export function PaymentWebview({
	order,
	setLoading,
	onCheckoutError,
	...props
}: PaymentWebviewProps) {
	const router = useRouter();
	const paymentURL = useObservableState(
		order.links$!.pipe(map((links) => get(links, ['payment', 0, 'href']))),
		get(order, ['links', 'payment', 0, 'href'])
	);
	const { wpCredentials } = useAppState();
	const jwt = useObservableState(wpCredentials.access_token$, wpCredentials.access_token);
	const { stockAdjustment } = useStockAdjustment();
	const { uiSettings } = useUISettings('pos-cart');
	const t = useT();
	const manager = useQueryManager();
	const http = useRestHttpClient();
	const paymentReceivedRef = React.useRef(false);
	const fallbackTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const loadCountRef = React.useRef(0);

	// Create a logger with order context
	const orderLogger = React.useMemo(
		() =>
			paymentLogger.with({
				orderId: order.uuid,
				orderNumber: order.number,
			}),
		[order.uuid, order.number]
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
		if (!order.id) {
			throw new Error('payment_refresh_requires_persisted_order');
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
	}, [manager, order.id]);

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
							orderNumber: payload.number || order.number,
						}),
						{
							showToast: true,
							saveToDb: true,
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
							pathname: `(modals)/cart/receipt/${order.uuid}`,
						});
					} else {
						router.replace({
							pathname: `cart`,
						});
					}
				} catch (err) {
					const errorMessage = err instanceof Error ? err.message : 'Payment processing error';
					orderLogger.error(errorMessage, {
						showToast: true,
						saveToDb: true,
						context: {
							errorCode: ERROR_CODES.PAYMENT_GATEWAY_ERROR,
							error: err instanceof Error ? err.message : String(err),
						},
					});
				} finally {
					setLoading(false);
				}
			}
		},
		[
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
			loadCountRef.current += 1;
			if (loadCountRef.current < 2) {
				return;
			}

			if (fallbackTimerRef.current) {
				clearTimeout(fallbackTimerRef.current);
			}

			fallbackTimerRef.current = setTimeout(async () => {
				if (paymentReceivedRef.current) return;

				// Check local status first - if it's no longer pos-open,
				// the postMessage path already handled the update
				const localStatus = order.getLatest().status;
				if (!localStatus || localStatus !== 'pos-open') return;

				try {
					orderLogger.debug('No postMessage received, checking server order status', {
						context: { orderId: order.id },
					});

					// The decision reads SERVER truth directly (the sync surface's
					// include-read) — an engine require's `ready` can settle without
					// applying a newer revision to THIS document (skip-coalesced
					// resident tasks, dirty-row protection), so it cannot prove
					// payment state. The engine refresh below is local catch-up only.
					const response = await http.get('orders', {
						params: { include: order.id, per_page: 1 },
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
							orderNumber: (serverOrder.number as string) || order.number,
						}),
						{
							showToast: true,
							saveToDb: true,
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
							pathname: `(modals)/cart/receipt/${order.uuid}`,
						});
					} else {
						router.replace({ pathname: `cart` });
					}
				} catch (err) {
					// Best-effort safety net only. Order completion is authoritatively
					// delivered via the postMessage path, so a failed or premature poll
					// (order not queryable yet or a transient sync error) is
					// expected and must NOT be surfaced as a payment-gateway failure —
					// doing so produced spurious PY02001 errors on successful checkouts.
					orderLogger.debug('Fallback order status refresh did not complete', {
						context: {
							error: err instanceof Error ? err.message : String(err),
							source: 'fallback-refresh',
						},
					});
				} finally {
					setLoading(false);
				}
			}, 1000);
		},
		[
			order,
			stockAdjustment,
			uiSettings.autoShowReceipt,
			router,
			setLoading,
			orderLogger,
			t,
			refreshOrder,
		]
	);

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
					onMessage={(event) => {
						const data = event?.nativeEvent?.data as Record<string, unknown> | undefined;
						const payload = data?.payload as Record<string, unknown> | undefined;
						if (payload?.data) {
							if (onCheckoutError?.(payload.data)) {
								setLoading(false);
								return;
							}
							orderLogger.error((payload?.message as string) || 'Payment error', {
								showToast: true,
								saveToDb: true,
								context: {
									errorCode: ERROR_CODES.PAYMENT_GATEWAY_ERROR,
									payloadData: payload?.data,
								},
							});
						} else {
							handlePaymentReceived({ data } as unknown as MessageEvent);
						}
					}}
					className="h-full flex-1"
				/>
			) : null}
		</ErrorBoundary>
	);
}
