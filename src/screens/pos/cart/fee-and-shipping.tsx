import * as React from 'react';
import Box from '@wcpos/common/src/components/box';
import Icon from '@wcpos/common/src/components/icon';
import Text from '@wcpos/common/src/components/text';

type OrderDocument = import('@wcpos/common/src/database').OrderDocument;

interface Props {
	order: OrderDocument;
}

const FeeAndShipping = ({ order }: Props) => {
	const handleAddFee = () => {
		order.addFeeLine({ name: 'Fee', total: '10' });
	};

	const handleAddShipping = () => {
		order.addShippingLine({ method_title: 'Shipping', method_id: '0', total: '10' });
	};

	return (
		<>
			<Box horizontal space="small" padding="small" align="center">
				<Box fill>
					<Text>Add Fee</Text>
				</Box>
				<Box>
					<Icon name="circlePlus" onPress={handleAddFee} />
				</Box>
			</Box>
			<Box horizontal space="small" padding="small" align="center">
				<Box fill>
					<Text>Add Shipping</Text>
				</Box>
				<Box>
					<Icon name="circlePlus" onPress={handleAddShipping} />
				</Box>
			</Box>
		</>
	);
};

export default FeeAndShipping;
