import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Button from '@wcpos/components/src/button';
import Modal, { useModal } from '@wcpos/components/src/modal';
import useCurrencyFormat from '@wcpos/hooks/src/use-currency-format';
import useRestHttpClient from '@wcpos/hooks/src/use-rest-http-client';
import Checkout from '../../checkout';
import useOpenOrders from '../../contexts/open-orders';

interface PayModalProps {
	order: import('@wcpos/database').OrderDocument;
}

/**
 *
 */
const PayButton = ({ order }: PayModalProps) => {
	const total = useObservableState(order.total$, order.total);
	const { format } = useCurrencyFormat();
	const { ref, open, close } = useModal();
	const http = useRestHttpClient();
	const { setCurrentOrder } = useOpenOrders();

	/**
	 *
	 */
	const saveOrder = React.useCallback(async () => {
		const data = await order.toRestApiJSON();
		let endpoint = 'orders';
		if (order.id) {
			endpoint += `/${order.id}`;
		}

		const result = await http.post(endpoint, {
			data,
		});

		if (result.status === 201 || result.status === 200) {
			if (order.id) {
				order.atomicPatch(result.data);
			} else {
				// switcharoo
				const newOrder = await order.collection.insert(result.data);
				await order.remove();
				setCurrentOrder(newOrder);
			}
		}
	}, [http, order, setCurrentOrder]);

	/**
	 *
	 */
	const handlePay = React.useCallback(() => {
		saveOrder().then(() => {
			open();
		});
	}, [open, saveOrder]);

	/**
	 *
	 */
	return (
		<>
			<Button
				fill
				size="large"
				title={`Checkout ${format(total || 0)}`}
				onPress={handlePay}
				type="success"
				style={{
					flex: 3,
					borderTopLeftRadius: 0,
					borderTopRightRadius: 0,
					borderBottomLeftRadius: 0,
				}}
			/>
			<Modal ref={ref} title="Checkout" size="large">
				<Checkout order={order} />
			</Modal>
		</>
	);
};

export default PayButton;
