import * as React from 'react';
import Box from '@wcpos/common/src/components/box';
import Icon from '@wcpos/common/src/components/icon';
import Text from '@wcpos/common/src/components/text';

type OrderDocument = import('@wcpos/common/src/database').OrderDocument;

interface AddShippingProps {
	order: OrderDocument;
}

const AddShipping = ({ order }: AddShippingProps) => {
	const handleAddShipping = () => {
		order.addShippingLine({ method_title: 'Shipping', method_id: '0', total: '10' });
	};

	return (
		<Box horizontal space="small" padding="small" align="center">
			<Box fill>
				<Text>Add Shipping</Text>
			</Box>
			<Box>
				<Icon name="circlePlus" onPress={handleAddShipping} />
			</Box>
		</Box>
	);
};

export default AddShipping;
