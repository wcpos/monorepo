import * as React from 'react';
import Icon from '@wcpos/common/src/components/icon';
import useSnackbar from '@wcpos/common/src/components/snackbar';
import { usePOSContext } from '../../../context';

interface ActionProps {
	item:
		| import('@wcpos/common/src/database').LineItemDocument
		| import('@wcpos/common/src/database').FeeLineDocument
		| import('@wcpos/common/src/database').ShippingLineDocument;
}

const Actions = ({ item }: ActionProps) => {
	const { currentOrder } = usePOSContext();
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

	return <Icon name="circleXmark" size="xLarge" onPress={handleRemove} type="critical" />;
};

export default Actions;
