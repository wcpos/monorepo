import * as React from 'react';
import { View, StyleSheet } from 'react-native';

import { useNavigation, StackActions } from '@react-navigation/native';
import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Loader from '@wcpos/components/src/loader';
import { useModal } from '@wcpos/components/src/modal';
import useSnackbar from '@wcpos/components/src/snackbar';
import WebView from '@wcpos/components/src/webview';
import log from '@wcpos/utils/src/logger';

import useOrders from '../../../contexts/orders';
import useRestHttpClient from '../../../hooks/use-rest-http-client';

export interface PaymentWebviewProps {
	order: import('@wcpos/database').OrderDocument;
}

const PaymentWebview = ({ order }: PaymentWebviewProps) => {
	const [loading, setLoading] = React.useState(true);
	const addSnackbar = useSnackbar();
	const { onPrimaryAction } = useModal();
	const iframeRef = React.useRef<HTMLIFrameElement>();
	const http = useRestHttpClient();
	const navigation = useNavigation();

	const paymentURL = useObservableState(
		order.links$.pipe(map((links) => get(links, ['payment', 0, 'href']))),
		get(order, ['links', 'payment', 0, 'href'])
	);

	/**
	 *
	 */
	React.useEffect(() => {
		async function saveOrder() {
			try {
				const { data } = await http.post('orders', {
					data: await order.toPopulatedJSON(),
				});
				//
				const parsedData = order.collection.parseRestResponse(data);
				await order.update(parsedData);
			} catch (err) {
				log.error(err);
			}
		}

		if (!paymentURL) {
			saveOrder();
		}
	}, [http, order, paymentURL]);

	/**
	 *
	 */
	// React.useEffect(() => setLoading(true), []);

	/**
	 *
	 */
	const handlePaymentReceived = React.useCallback(
		async (event: MessageEvent) => {
			if (event?.data?.action === 'wcpos-payment-received') {
				try {
					const { payload } = event.data;
					const parsedData = order.collection.parseRestResponse(payload);
					await order.update(parsedData);
					navigation.dispatch(
						StackActions.replace('Receipt', {
							orderID: order.uuid,
						})
					);
				} catch (err) {
					log.error(err);
				}
			}
		},
		[navigation, order]
	);

	/**
	 *
	 */
	onPrimaryAction(() => {
		if (iframeRef.current && iframeRef.current.contentWindow) {
			setLoading(true);
			iframeRef.current.contentWindow.postMessage({ action: 'wcpos-process-payment' }, '*');
		}
	});

	/**
	 *
	 */
	return (
		<View style={{ position: 'relative', height: '100%', paddingLeft: 10 }}>
			{loading ? (
				<View
					style={[
						StyleSheet.absoluteFill,
						{
							position: 'absolute',
							backgroundColor: '#FFF',
							alignItems: 'center',
							justifyContent: 'center',
						},
					]}
				>
					<Loader size="large" type="secondary" />
				</View>
			) : null}
			<ErrorBoundary>
				{paymentURL ? (
					<WebView
						ref={iframeRef}
						src={paymentURL}
						onLoad={() => {
							setLoading(false);
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
