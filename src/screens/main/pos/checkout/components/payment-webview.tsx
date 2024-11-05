import * as React from 'react';
import { View } from 'react-native';

import { useNavigation, StackActions } from '@react-navigation/native';
import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { Toast } from '@wcpos/components/src/toast';
import { WebView } from '@wcpos/components/src/webview';
import log from '@wcpos/utils/src/logger';

import { useAppState } from '../../../../../contexts/app-state';
import { useUISettings } from '../../../contexts/ui-settings';
import { useStockAdjustment } from '../../../hooks/use-stock-adjustment';

type OrderDocument = import('@wcpos/database').OrderDocument;

export interface PaymentWebviewProps {
	order: OrderDocument;
	setLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 *
 */
export const PaymentWebview = React.forwardRef<HTMLIFrameElement, PaymentWebviewProps>(
	({ order, setLoading }: PaymentWebviewProps, ref) => {
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
						setLoading(false);
					}
				}
			},
			[navigation, order, stockAdjustment, uiSettings.autoShowReceipt, setLoading]
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
						ref={ref}
						src={paymentURLWithToken}
						onLoad={onWebViewLoaded}
						onMessage={(event) => {
							if (event?.data?.payload?.data) {
								Toast.show({ text1: event?.data?.payload?.message, type: 'error' });
							} else {
								handlePaymentReceived(event);
							}
						}}
						className="h-full flex-1"
					/>
				) : null}
			</ErrorBoundary>
		);
	}
);
