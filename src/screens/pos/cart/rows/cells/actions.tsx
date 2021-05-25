import * as React from 'react';
import { View } from 'react-native';
import Icon from '@wcpos/common/src/components/icon';
import Dialog from '@wcpos/common/src/components/dialog';
import TextInput from '@wcpos/common/src/components/textinput';
import Select from '@wcpos/common/src/components/select';
import Checkbox from '@wcpos/common/src/components/checkbox';
import MetaData from '@wcpos/common/src/components/meta-data';
import { useSnackbar } from '@wcpos/common/src/components/snackbar/use-snackbar';
import { POSContext } from '../../../pos';

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
		<View style={{ flexDirection: 'row' }}>
			<Icon name="more-vert" size="large" onPress={() => setVisible(true)} />
			<Icon name="remove" size="large" onPress={handleRemove} />
			{visible && (
				<Dialog
					open
					onClose={() => setVisible(false)}
					primaryAction={{ label: 'Save', action: () => setVisible(false) }}
				>
					<Dialog.Section>
						<TextInput label="Name" value={item.name} />
						<Checkbox
							label="Taxable"
							checked={item.taxStatus === 'taxable'}
							onChange={(value) => item.atomicPatch({ taxStatus: value ? 'taxable' : 'none' })}
						/>
						<TextInput label="Tax Class" value={item.taxClass} />
						<MetaData
							// @ts-ignore
							data={item.metaData}
						/>
					</Dialog.Section>
				</Dialog>
			)}
		</View>
	);
};

export default Actions;
