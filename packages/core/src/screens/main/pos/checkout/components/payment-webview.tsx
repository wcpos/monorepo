import * as React from 'react';

import { useRouter } from 'expo-router';
import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { WebView } from '@wcpos/components/webview';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useAppState } from '../../../../../contexts/app-state';
import { useT } from '../../../../../contexts/translations';
import { useUISettings } from '../../../contexts/ui-settings';
import { useStockAdjustment } from '../../../hooks/use-stock-adjustment';

const paymentLogger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);

type OrderDocument = import('@wcpos/database').OrderDocument;

export interface PaymentWebviewProps extends Partial<React.ComponentProps<typeof WebView>> {
	order: OrderDocument;
	setLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 *
 */
export function PaymentWebview({ order, setLoading, ...props }: PaymentWebviewProps) {
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
					const payload = event.data.payload;
					// get line_items with "_reduced_stock" meta
					const reducedStockItems = (payload?.line_items || []).filter(
						(item: Record<string, unknown>) =>
							(item.meta_data as { key: string }[])?.some(
								(meta: { key: string }) => meta.key === '_reduced_stock'
							)
					);
					stockAdjustment(reducedStockItems);

					const latest = order.getLatest();
					const existingLinks = latest.links;
					const parsedData = (
						latest.collection as unknown as {
							parseRestResponse: (data: unknown) => Record<string, unknown>;
						}
					).parseRestResponse(payload);

					// Preserve existing links that the payment response didn't include.
					// The server may not return receipt/payment links in the payment response,
					// but parseRestResponse defaults missing arrays to [], which would wipe them.
					if (parsedData.links && existingLinks) {
						const parsedLinks = parsedData.links as Record<string, { href?: string }[]>;
						const existingLinksRecord = existingLinks as Record<
							string,
							{ href?: string }[] | undefined
						>;
						for (const key of Object.keys(existingLinksRecord)) {
							if (
								(existingLinksRecord[key]?.length ?? 0) > 0 &&
								(!parsedLinks[key] || parsedLinks[key].length === 0)
							) {
								parsedLinks[key] = existingLinksRecord[key]!;
							}
						}
					}

					const success = await latest.incrementalPatch(parsedData);
					if (success) {
						// Log payment completed successfully
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

						if (uiSettings.autoShowReceipt) {
							router.replace({
								pathname: `(modals)/cart/receipt/${order.uuid}`,
							});
						} else {
							router.replace({
								pathname: `cart`,
							});
						}
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
		[router, order, stockAdjustment, uiSettings.autoShowReceipt, setLoading, orderLogger, t]
	);

	/**
	 *
	 */
	const onWebViewLoaded = React.useCallback((_event: unknown) => {
		//
	}, []);

	/**
	 *
	 */
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
							orderLogger.error((payload?.message as string) || 'Payment error', {
								showToast: true,
								saveToDb: true,
								context: {
									errorCode: ERROR_CODES.PAYMENT_GATEWAY_ERROR,
									payloadData: payload?.data,
								},
							});
						} else {
							handlePaymentReceived(data as unknown as MessageEvent);
						}
					}}
					className="h-full flex-1"
				/>
			) : null}
		</ErrorBoundary>
	);
}
