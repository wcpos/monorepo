import * as React from 'react';
import Box from '@wcpos/common/src/components/box';
import Icon from '@wcpos/common/src/components/icon';
import Text from '@wcpos/common/src/components/text';

type OrderDocument = import('@wcpos/common/src/database').OrderDocument;

interface AddFeeProps {
	order: OrderDocument;
}

const AddFee = ({ order }: AddFeeProps) => {
	const handleAddFee = () => {
		order.addFeeLine({ name: 'Fee', total: '10' });
	};

	return (
		<Box horizontal space="small" padding="small" align="center">
			<Box fill>
				<Text>Add Fee</Text>
			</Box>
			<Box>
				<Icon name="circlePlus" onPress={handleAddFee} />
			</Box>
		</Box>
	);
};

export default AddFee;
