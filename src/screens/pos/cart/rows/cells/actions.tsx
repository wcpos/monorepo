import * as React from 'react';
import { View } from 'react-native';
import Icon from '@wcpos/common/src/components/icon';
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
	const [visible, setVisible] = React.useState(false);
	const { currentOrder } = React.useContext(POSContext);
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
		<View style={{ flexDirection: 'row', alignItems: 'center' }}>
			<Icon name="more-vert" size="large" onPress={() => setVisible(true)} backgroundStyle="none" />
			<Icon name="remove" size="x-large" onPress={handleRemove} backgroundStyle="none" />
			{visible && <EditModal item={item} onClose={() => setVisible(false)} />}
		</View>
	);
};

export default Actions;
