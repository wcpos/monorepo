import * as React from 'react';

import WebView from '@wcpos/components/src/webview';

import useOrders from '../../../../../../contexts/orders';

export interface PaymentWebviewProps {
	gatewayID: string;
}

const PaymentWebview = ({ gatewayID }: PaymentWebviewProps) => {
	const { data: order } = useOrders();
	const paymentUrl = order[0].payment_url;

	return (
		<WebView
			// ref={iframeRef}
			src={`${paymentUrl}&wcpos=1&gateway=${gatewayID}`}
			onLoad={() => {
				// setLoading(false);
			}}
			onMessage={(event) => {
				// if (event?.data?.payload?.data) {
				// 	addSnackbar({ message: event?.data?.payload?.message });
				// } else {
				// 	handlePaymentReceived(event);
				// }
			}}
			style={{ height: '100%' }}
		/>
	);
};

export default PaymentWebview;
