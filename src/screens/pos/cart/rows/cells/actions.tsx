import * as React from 'react';
import Icon from '@wcpos/common/src/components/icon';
import Box from '@wcpos/common/src/components/box';
import Modal, { useModal } from '@wcpos/common/src/components/modal';
import useSnackbar from '@wcpos/common/src/components/snackbar';
import { usePOSContext } from '../../../context';
import EditModal from './edit-modal';

interface ActionProps {
	item:
		| import('@wcpos/common/src/database').LineItemDocument
		| import('@wcpos/common/src/database').FeeLineDocument
		| import('@wcpos/common/src/database').ShippingLineDocument;
}

const Actions = ({ item }: ActionProps) => {
	const { currentOrder } = usePOSContext();
	const { ref: modalRef, open, close } = useModal();
	const addSnackbar = useSnackbar();

	const undoRemove = () => {
		console.log('Undo remove', item);
	};

	const handleRemove = () => {
		currentOrder?.removeCartLine(item);
		addSnackbar({
			message: `${item.name} removed from cart`,
			dismissable: true,
			action: { label: 'Undo', action: undoRemove },
		});
	};

	return (
		<>
			<Box horizontal space="small" align="center">
				<Icon name="ellipsisVertical" size="large" onPress={open} />
				<Icon name="circleXmark" size="xLarge" onPress={handleRemove} type="critical" />
			</Box>

			<Modal ref={modalRef} title={`Edit ${item.name}`}>
				<EditModal item={item} />
			</Modal>
		</>
	);
};

export default Actions;
