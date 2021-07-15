import * as React from 'react';
import Segment from '@wcpos/common/src/components/segment';
import Text from '@wcpos/common/src/components/text';
import WebView from '@wcpos/common/src/components/webview';
import Button from '@wcpos/common/src/components/button';
import { POSContext } from '../pos';

export const Checkout = () => {
	const { currentOrder, currentCustomer } = React.useContext(POSContext);

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
				<WebView src={`http://localhost:8888/wcpos-checkout/${currentOrder.id}?wcpos=1`} />
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
