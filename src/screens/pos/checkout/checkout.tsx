import * as React from 'react';
import get from 'lodash/get';
import useCurrencyFormat from '@wcpos/hooks/src/use-currency-format';
import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';
import WebView from '@wcpos/components/src/webview';
import Button from '@wcpos/components/src/button';
import Accordion from '@wcpos/components/src/accordion';
import Tabs from '@wcpos/components/src/tabs';
// import { POSContext } from '../pos';

interface CheckoutProps {
	order: import('@wcpos/database').OrderDocument;
}

const gateways = [
	{ key: 'pos_cash', title: 'Cash' },
	{ key: 'card', title: 'Card' },
	{ key: 'paypal', title: 'PayPal' },
	{ key: 'stripe', title: 'Stripe' },
];

export const Checkout = ({ order }: CheckoutProps) => {
	const [index, setIndex] = React.useState(0);
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
	const renderScene = ({ route }: { route: typeof routes[number] }) => {
		return <WebView ref={iframeRef} src={`${paymentUrl}&wcpos=1&gateway=${route.key}`} />;
	};

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
				onIndexChange={setIndex}
				navigationState={{ index, routes }}
				renderScene={renderScene}
				tabBarPosition="left"
				style={{ minHeight: 400 }}
			/>
			<Button title="Process Order" onPress={handleProcessPayment} />
		</Box>
	);
};
