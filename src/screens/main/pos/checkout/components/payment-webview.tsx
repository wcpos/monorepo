import * as React from 'react';
import { View } from 'react-native';

import { useNavigation, StackActions } from '@react-navigation/native';
import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import { useModal } from '@wcpos/components/src/modal';
import useSnackbar from '@wcpos/components/src/snackbar';
import WebView from '@wcpos/components/src/webview';
import log from '@wcpos/utils/src/logger';

type OrderDocument = import('@wcpos/database').OrderDocument;

export interface PaymentWebviewProps {
	order: OrderDocument;
}

const PaymentWebview = ({ order }: PaymentWebviewProps) => {
	const addSnackbar = useSnackbar();
	const { setPrimaryAction } = useModal();
	const iframeRef = React.useRef<HTMLIFrameElement>();
	const navigation = useNavigation();
	const paymentURL = useObservableState(
		order.links$.pipe(map((links) => get(links, ['payment', 0, 'href']))),
		get(order, ['links', 'payment', 0, 'href'])
	);

	/**
	 *
	 */
	const handlePaymentReceived = React.useCallback(
		async (event: MessageEvent) => {
			if (event?.data?.action === 'wcpos-payment-received') {
				try {
					const payload = event.data.payload;
					if (payload) {
						const latest = order.getLatest();
						const parsedData = latest.collection.parseRestResponse(payload);
						const success = await latest.incrementalPatch(parsedData);
						if (success) {
							navigation.dispatch(
								StackActions.replace('Receipt', {
									orderID: order.uuid,
								})
							);
						}
					}
				} catch (err) {
					log.error(err);
					addSnackbar({ message: err?.message, type: 'error' });
				} finally {
					setPrimaryAction((prev) => {
						return {
							...prev,
							loading: false,
						};
					});
				}
			}
		},
		[addSnackbar, navigation, order, setPrimaryAction]
	);

	/**
	 *
	 */
	const handleProcessPayment = React.useCallback(() => {
		if (iframeRef.current && iframeRef.current.contentWindow) {
			iframeRef.current.contentWindow.postMessage({ action: 'wcpos-process-payment' }, '*');
		}
		setPrimaryAction((prev) => {
			return {
				...prev,
				loading: true,
			};
		});
	}, [setPrimaryAction]);

	/**
	 *
	 */
	setPrimaryAction((prev) => ({
		...prev,
		action: handleProcessPayment,
	}));

	/**
	 *
	 */
	return (
		<View style={{ flex: 1 }}>
			<ErrorBoundary>
				{paymentURL ? (
					<WebView
						ref={iframeRef}
						src={paymentURL}
						onLoad={() => {
							// setLoading(false);
						}}
						onMessage={(event) => {
							if (event?.data?.payload?.data) {
								addSnackbar({ message: event?.data?.payload?.message });
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
