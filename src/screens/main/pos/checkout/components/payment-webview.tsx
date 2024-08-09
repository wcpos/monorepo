import * as React from 'react';
import { View } from 'react-native';

import { useNavigation, StackActions } from '@react-navigation/native';
import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { Toast } from '@wcpos/tailwind/src/toast';
import { WebView } from '@wcpos/tailwind/src/webview';
import log from '@wcpos/utils/src/logger';

import { useAppState } from '../../../../../contexts/app-state';
import { useUISettings } from '../../../contexts/ui-settings';
import { useStockAdjustment } from '../../../hooks/use-stock-adjustment';

type OrderDocument = import('@wcpos/database').OrderDocument;

export interface PaymentWebviewProps {
	order: OrderDocument;
}

const PaymentWebview = ({ order }: PaymentWebviewProps) => {
	const iframeRef = React.useRef<HTMLIFrameElement>();
	const navigation = useNavigation();
	const paymentURL = useObservableState(
		order.links$.pipe(map((links) => get(links, ['payment', 0, 'href']))),
		get(order, ['links', 'payment', 0, 'href'])
	);
	const { wpCredentials } = useAppState();
	const jwt = useObservableState(wpCredentials.jwt$, wpCredentials.jwt);
	const { stockAdjustment } = useStockAdjustment();
	const { uiSettings } = useUISettings('pos-cart');

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
						if (uiSettings.autoShowReceipt) {
							navigation.dispatch(
								StackActions.replace('Receipt', {
									orderID: order.uuid,
								})
							);
						} else {
							navigation.navigate('POSStack', { screen: 'POS' });
						}
					}
				} catch (err) {
					log.error(err);
					Toast.show({ text1: err?.message, type: 'error' });
				} finally {
					//
				}
			}
		},
		[navigation, order, stockAdjustment, uiSettings.autoShowReceipt]
	);

	/**
	 *
	 */
	const handleProcessPayment = React.useCallback(() => {
		if (iframeRef.current && iframeRef.current.contentWindow) {
			iframeRef.current.contentWindow.postMessage({ action: 'wcpos-process-payment' }, '*');
		}
	}, []);

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
		<View style={{ flex: 1 }}>
			<ErrorBoundary>
				{paymentURL ? (
					<WebView
						ref={iframeRef}
						src={paymentURLWithToken}
						onLoad={onWebViewLoaded}
						onMessage={(event) => {
							if (event?.data?.payload?.data) {
								Toast.show({ text1: event?.data?.payload?.message, type: 'error' });
							} else {
								handlePaymentReceived(event);
							}
						}}
						style={{ height: '100%' }}
					/>
				) : null}
			</ErrorBoundary>
		</View>
	);
};

export default PaymentWebview;
