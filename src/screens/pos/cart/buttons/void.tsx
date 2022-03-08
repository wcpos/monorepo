import * as React from 'react';
import Button from '@wcpos/common/src/components/button';
import useSnackbar from '@wcpos/common/src/components/snackbar';
import { usePOSContext } from '../../context';

interface VoidButtonProps {
	order: import('@wcpos/common/src/database').OrderDocument;
}

const VoidButton = ({ order }: VoidButtonProps) => {
	const { setCurrentOrder } = usePOSContext();
	const addSnackbar = useSnackbar();

	const undoRemove = async () => {
		// @TODO - see https://github.com/pubkey/rxdb/issues/911
		// await order.atomicUpdate((oldData) => {
		// 	oldData._deleted = false;
		// 	return oldData;
		// });
		// setCurrentOrder(order);
	};

	return (
		<Button
			fill
			size="large"
			title="Void"
			onPress={async () => {
				await order.remove();
				setCurrentOrder(null);
				addSnackbar({
					message: 'Order removed',
					dismissable: true,
					action: { label: 'Undo', action: undoRemove },
				});
			}}
			type="critical"
			// style={{ width: '33%' }}
		/>
	);
};

export default VoidButton;
