import * as React from 'react';
import { View, StyleSheet } from 'react-native';
import get from 'lodash/get';
import useCurrencyFormat from '@wcpos/hooks/src/use-currency-format';
import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';
import WebView from '@wcpos/components/src/webview';
import Button from '@wcpos/components/src/button';
import Accordion from '@wcpos/components/src/accordion';
import Loader from '@wcpos/components/src/loader';
import Tabs from '@wcpos/components/src/tabs';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
// import { POSContext } from '../pos';

interface CheckoutProps {
	order: import('@wcpos/database').OrderDocument;
}

const gateways = [
	{ key: 'pos_cash', title: 'Cash' },
	{ key: 'card', title: 'Card' },
	{ key: 'paypal', title: 'PayPal' },
	{ key: 'stripe', title: 'Stripe' },
	{ key: 'bacs', title: 'BACS' },
];

export const Checkout = ({ order }: CheckoutProps) => {
	const [index, setIndex] = React.useState(0);
	const [loading, setLoading] = React.useState(true);
	const paymentUrl = get(order, ['links', 'payment', 0, 'href'], '');
	const { format } = useCurrencyFormat();
	const iframeRef = React.useRef<HTMLIFrameElement>();

	/**
	 *
	 */
	const routes = gateways;

	/**
	 *
	 */
	// React.useEffect(() => {
	// 	if (iframeRef.current) {
	// 		iframeRef.current.contentWindow?.addEventListener(
	// 			'message',
	// 			(event) => {
	// 				console.log(event);
	// 			},
	// 			false
	// 		);
	// 	}
	// }, []);

	/**
	 *
	 */
	const renderScene = React.useCallback(
		({ route }: { route: typeof routes[number] }) => {
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
							ref={iframeRef}
							src={`${paymentUrl}&wcpos=1&gateway=${route.key}`}
							onLoad={() => {
								setLoading(false);
							}}
							onMessage={(event) => {
								console.log(event);
							}}
						/>
					</ErrorBoundary>
				</View>
			);
		},
		[loading, paymentUrl]
	);

	/**
	 *
	 */
	const handleProcessPayment = React.useCallback(() => {
		if (iframeRef.current && iframeRef.current.contentWindow) {
			setLoading(true);
			iframeRef.current.contentWindow.postMessage({ action: 'wcpos-process-payment' }, '*');
		}
	}, []);

	/**
	 *
	 */
	if (!order) {
		// TODO: show error
		return null;
	}

	/**
	 *
	 */
	return (
		<Box space="medium">
			<Text size="large" align="center" weight="bold">
				{`Amount to Pay: ${format(order.total || 0)}`}
			</Text>
			<Tabs<typeof routes[number]>
				onIndexChange={(idx) => {
					setLoading(true);
					setIndex(idx);
				}}
				navigationState={{ index, routes }}
				renderScene={renderScene}
				tabBarPosition="left"
				style={{ minHeight: 400 }}
			/>
			<Button title="Process Order" onPress={handleProcessPayment} />
		</Box>
	);
};
