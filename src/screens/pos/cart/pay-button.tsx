import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Button from '@wcpos/common/src/components/button';
import Modal, { useModal } from '@wcpos/common/src/components/modal';
import Checkout from '../checkout';

interface PayModalProps {
	order: import('@wcpos/common/src/database').OrderDocument;
}

const PayButton = ({ order }: PayModalProps) => {
	const total = useObservableState(order.total$, 0);
	const { ref, open, close } = useModal();

	return (
		<>
			<Button
				fill
				size="large"
				title={`Pay ${total}`}
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
