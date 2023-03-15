import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import EditFeeLineButton from './edit-fee-line';

interface Props {
	item: import('@wcpos/database').FeeLineDocument;
}

export const FeeName = ({ item }: Props) => {
	const name = useObservableState(item.name$, item.name);

	return (
		<Box horizontal space="xSmall" style={{ width: '100%' }}>
			<Box fill>
				<Text>{name}</Text>
			</Box>
			<Box distribution="center">
				<EditFeeLineButton item={item} />
			</Box>
		</Box>
	);
};
