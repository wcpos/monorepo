import * as React from 'react';
import Segment from '@wcpos/common/src/components/segment';
import Text from '@wcpos/common/src/components/text';
import WebView from '@wcpos/common/src/components/webview';
import Button from '@wcpos/common/src/components/button';
import Accordion from '@wcpos/common/src/components/accordion';
import { POSContext } from '../pos';

export const Checkout = () => {
	const { currentOrder, currentCustomer } = React.useContext(POSContext);
	const paymentUrlMeta = currentOrder?.metaData?.find((meta) => meta.key === '_pos_checkout_url');

	if (currentOrder?.status !== 'pos-checkout') {
		throw Error('Order does not have the right status');
	}

	React.useEffect(() => {
		async function saveOrder() {
			const replicationState = currentOrder?.syncRestApi({
				push: {},
			});
			replicationState.error$.subscribe((err: any) => {
				console.log(err);
			});
			replicationState.run(false);
		}

		saveOrder();
	}, [currentOrder]);

	return (
		<Segment.Group>
			<Segment>
				<Text>Order Total: {currentOrder?.total}</Text>
			</Segment>
			<Segment grow>
				<Accordion
					items={[
						{
							label: 'Stripe',
							content: <WebView src={`${paymentUrlMeta?.value}&wcpos=1&gateway=stripe`} />,
						},
						{
							label: 'BACS',
							content: <WebView src={`${paymentUrlMeta?.value}&wcpos=1&gateway=bacs`} />,
						},
						{
							label: 'Cheque',
							content: <WebView src={`${paymentUrlMeta?.value}&wcpos=1&gateway=cheque`} />,
						},
						{
							label: 'COD',
							content: <WebView src={`${paymentUrlMeta?.value}&wcpos=1&gateway=cod`} />,
						},
						{
							label: 'PayPal',
							content: <WebView src={`${paymentUrlMeta?.value}&wcpos=1&gateway=paypal`} />,
						},
					]}
				/>
			</Segment>
			<Segment>
				<Button
					title="Go Back"
					onPress={() => {
						currentOrder.atomicPatch({ status: 'pos-open' });
					}}
				/>
			</Segment>
		</Segment.Group>
	);
};
