import * as React from 'react';
import Button from '@wcpos/components/src/button';
import useSnackbar from '@wcpos/components/src/snackbar';
import { usePOSContext } from '../../context';

interface VoidButtonProps {
	order: import('@wcpos/database').OrderDocument;
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
			style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
		/>
	);
};

export default VoidButton;
