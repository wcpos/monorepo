import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Button from '@wcpos/components/src/button';
import Modal, { useModal } from '@wcpos/components/src/modal';
import useCurrencyFormat from '@wcpos/hooks/src/use-currency-format';
import Checkout from '../../checkout';

interface PayModalProps {
	order: import('@wcpos/database').OrderDocument;
}

const PayButton = ({ order }: PayModalProps) => {
	const total = useObservableState(order.total$, order.total);
	const { format } = useCurrencyFormat();
	const { ref, open, close } = useModal();

	return (
		<>
			<Button
				fill
				size="large"
				title={`Checkout ${format(total || 0)}`}
				onPress={open}
				type="success"
				style={{ flex: 3 }}
			/>
			<Modal ref={ref} title="Checkout" size="large">
				<Checkout order={order} />
			</Modal>
		</>
	);
};

export default PayButton;
