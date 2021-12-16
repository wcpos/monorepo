import * as React from 'react';
import Icon from '@wcpos/common/src/components/icon';
import Box from '@wcpos/common/src/components/box';
import Modal, { useModal } from '@wcpos/common/src/components/modal';
import { useSnackbar } from '@wcpos/common/src/components/snackbar/use-snackbar';
import { POSContext } from '../../../pos';
import EditModal from './edit-modal';

interface ActionProps {
	item:
		| import('@wcpos/common/src/database').LineItemDocument
		| import('@wcpos/common/src/database').FeeLineDocument
		| import('@wcpos/common/src/database').ShippingLineDocument;
}

const Actions = ({ item }: ActionProps) => {
	const { currentOrder } = React.useContext(POSContext);
	const { ref: modalRef, open, close } = useModal();

	const undoFeeRemove = () => {
		console.log('Undo remove', item);
	};

	const showSnackbar = useSnackbar({
		message: 'Item removed',
		dismissable: true,
		action: { label: 'Undo', action: undoFeeRemove },
	});

	const handleRemove = () => {
		currentOrder?.removeCartLine(item);
		showSnackbar();
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
