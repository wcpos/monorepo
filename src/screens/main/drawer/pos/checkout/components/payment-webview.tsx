import * as React from 'react';
import { View, StyleSheet } from 'react-native';

import get from 'lodash/get';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Loader from '@wcpos/components/src/loader';
import useSnackbar from '@wcpos/components/src/snackbar';
import WebView from '@wcpos/components/src/webview';

import useOrders from '../../../../../../contexts/orders';

export interface PaymentWebviewProps {
	gatewayID: string;
}

const PaymentWebview = ({ gatewayID }: PaymentWebviewProps) => {
	const [loading, setLoading] = React.useState(true);
	const { data: order } = useOrders();
	const paymentUrl = get(order, ['links', 'payment', 0, 'href']);
	const addSnackbar = useSnackbar();

	/**
	 *
	 */
	const handlePaymentReceived = React.useCallback((event: MessageEvent) => {
		if (event?.data?.action === 'wcpos-payment-received') {
			debugger;
		}
	}, []);

	if (!order) {
		throw new Error('Order not found');
	}

	if (!paymentUrl) {
		throw new Error('Payment url not found');
	}

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
				<WebView
					// ref={iframeRef}
					src={`${paymentUrl}&wcpos=1&gateway=${gatewayID}`}
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
			</ErrorBoundary>
		</View>
	);
};

export default PaymentWebview;
