import * as React from 'react';
import Box from '@wcpos/common/src/components/box';
import Text from '@wcpos/common/src/components/text';
import WebView from '@wcpos/common/src/components/webview';
import Button from '@wcpos/common/src/components/button';
import Accordion from '@wcpos/common/src/components/accordion';
import Tabs from '@wcpos/common/src/components/tabs';
// import { POSContext } from '../pos';

interface CheckoutProps {
	order: import('@wcpos/common/src/database').OrderDocument;
}

const gateways = [
	{ key: 'cash', title: 'Cash' },
	{ key: 'card', title: 'Card' },
	{ key: 'paypal', title: 'PayPal' },
	{ key: 'stripe', title: 'Stripe' },
];

export const Checkout = ({ order }: CheckoutProps) => {
	const [index, setIndex] = React.useState(0);

	/**
	 *
	 */
	const routes = gateways;

	/**
	 *
	 */
	const renderScene = ({ route }: { route: typeof routes[number] }) => {
		return <WebView src={`&wcpos=1&gateway=${route.key}`} />;
	};

	/**
	 *
	 */
	return (
		<Box style={{ height: 600 }}>
			<Text>Pay {order.total}</Text>
			<Tabs<typeof routes[number]>
				onIndexChange={setIndex}
				navigationState={{ index, routes }}
				renderScene={renderScene}
				tabBarPosition="left"
			/>
		</Box>
	);
};

// export const Checkout = () => {
// 	const { currentOrder, currentCustomer } = React.useContext(POSContext);
// 	const paymentUrlMeta = currentOrder?.metaData?.find((meta) => meta.key === '_pos_checkout_url');

// 	if (currentOrder?.status !== 'pos-checkout') {
// 		throw Error('Order does not have the right status');
// 	}

// 	React.useEffect(() => {
// 		async function saveOrder() {
// 			const replicationState = currentOrder?.syncRestApi({
// 				push: {},
// 			});
// 			replicationState.error$.subscribe((err: any) => {
// 				console.log(err);
// 			});
// 			replicationState.run(false);
// 		}

// 		saveOrder();
// 	}, [currentOrder]);

// 	return (
// 		<Segment.Group>
// 			<Segment>
// 				<Text>Order Total: {currentOrder?.total}</Text>
// 			</Segment>
// 			<Segment grow>
// 				{paymentUrlMeta?.value ? (
// 					<Accordion
// 						items={[
// 							{
// 								label: 'Stripe',
// 								content: <WebView src={`${paymentUrlMeta?.value}&wcpos=1&gateway=stripe`} />,
// 							},
// 							{
// 								label: 'BACS',
// 								content: <WebView src={`${paymentUrlMeta?.value}&wcpos=1&gateway=bacs`} />,
// 							},
// 							{
// 								label: 'Cheque',
// 								content: <WebView src={`${paymentUrlMeta?.value}&wcpos=1&gateway=cheque`} />,
// 							},
// 							{
// 								label: 'COD',
// 								content: <WebView src={`${paymentUrlMeta?.value}&wcpos=1&gateway=cod`} />,
// 							},
// 							{
// 								label: 'PayPal',
// 								content: <WebView src={`${paymentUrlMeta?.value}&wcpos=1&gateway=paypal`} />,
// 							},
// 						]}
// 					/>
// 				) : null}
// 			</Segment>
// 			<Segment>
// 				<Button
// 					title="Go Back"
// 					onPress={() => {
// 						currentOrder.atomicPatch({ status: 'pos-open' });
// 					}}
// 				/>
// 			</Segment>
// 		</Segment.Group>
// 	);
// };
