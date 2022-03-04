import * as React from 'react';
import Button from '@wcpos/common/src/components/button';
import Modal, { useModal } from '@wcpos/common/src/components/modal';
import EditModal from '../../../common/edit-modal';

interface OrderMetaButtonProps {
	order: import('@wcpos/common/src/database').OrderDocument;
}

const OrderMetaButton = ({ order }: OrderMetaButtonProps) => {
	const { ref, open, close } = useModal();

	return (
		<>
			<Button title="Order Meta" background="outline" onPress={open} />
			<Modal ref={ref} title="Edit Order">
				<EditModal item={order} />
			</Modal>
		</>
	);
};

export default OrderMetaButton;
