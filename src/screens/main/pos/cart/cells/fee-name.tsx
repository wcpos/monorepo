import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import { EdittableText } from '@wcpos/components/src/edittable-text';

import EditFeeLineButton from './edit-fee-line';

interface Props {
	item: import('@wcpos/database').FeeLineDocument;
}

export const FeeName = ({ item }: Props) => {
	const name = useObservableState(item.name$, item.name);

	/**
	 *
	 */
	const handleUpdate = React.useCallback(
		(newValue: string) => {
			item.incrementalPatch({ name: newValue });
		},
		[item]
	);

	return (
		<Box horizontal space="xSmall" style={{ width: '100%' }}>
			<Box fill>
				<EdittableText weight="bold" onChange={handleUpdate}>
					{name}
				</EdittableText>
			</Box>
			<Box distribution="center">
				<EditFeeLineButton item={item} />
			</Box>
		</Box>
	);
};
