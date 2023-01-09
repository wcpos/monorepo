import * as React from 'react';

import Box from '@wcpos/components/src/box';
import Icon from '@wcpos/components/src/icon';
import Text from '@wcpos/components/src/text';

import { t } from '../../../../lib/translations';

type OrderDocument = import('@wcpos/database').OrderDocument;

interface AddFeeProps {
	order: OrderDocument;
}

const AddFee = ({ order }: AddFeeProps) => {
	const handleAddFee = React.useCallback(() => {
		order.addFeeLine({ name: 'Fee', total: '10' });
	}, [order]);

	return (
		<Box horizontal space="small" padding="small" align="center">
			<Box fill>
				<Text>{t('Add Fee', { _tags: 'core' })}</Text>
			</Box>
			<Box>
				<Icon name="circlePlus" onPress={handleAddFee} />
			</Box>
		</Box>
	);
};

export default AddFee;
