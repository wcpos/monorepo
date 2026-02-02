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

export interface PaymentWebviewProps extends React.ComponentProps<typeof WebView> {
	order: OrderDocument;
	setLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 *
 */
export const PaymentWebview = ({ order, setLoading, ...props }: PaymentWebviewProps) => {
	const router = useRouter();
	const paymentURL = useObservableState(
		order.links$.pipe(map((links) => get(links, ['payment', 0, 'href']))),
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
		// Append the JWT token as a query parameter to the payment URL
		const url = new URL(paymentURL);
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
					const reducedStockItems = (payload?.line_items || []).filter((item) =>
						item.meta_data.some((meta) => meta.key === '_reduced_stock')
					);
					stockAdjustment(reducedStockItems);

					const latest = order.getLatest();
					const parsedData = latest.collection.parseRestResponse(payload);
					const success = await latest.incrementalPatch(parsedData);
					if (success) {
						// Log payment completed successfully
						orderLogger.success(
							t('Payment completed for order #{orderNumber}', {
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
								pathname: `/(modals)/cart/receipt/${order.uuid}`,
							});
						} else {
							router.replace({
								pathname: `cart`,
							});
						}
					}
				} catch (err) {
					orderLogger.error(err?.message || 'Payment processing error', {
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
	const onWebViewLoaded = React.useCallback((event) => {
		//
	}, []);

	/**
	 *
	 */
	return (
		<ErrorBoundary>
			{paymentURL ? (
				<WebView
					src={paymentURLWithToken}
					onLoad={onWebViewLoaded}
					onMessage={(event) => {
						if (event?.data?.payload?.data) {
							orderLogger.error(event?.data?.payload?.message || 'Payment error', {
								showToast: true,
								saveToDb: true,
								context: {
									errorCode: ERROR_CODES.PAYMENT_GATEWAY_ERROR,
									payloadData: event?.data?.payload?.data,
								},
							});
						} else {
							handlePaymentReceived(event);
						}
					}}
					className="h-full flex-1"
					{...props}
				/>
			) : null}
		</ErrorBoundary>
	);
};
