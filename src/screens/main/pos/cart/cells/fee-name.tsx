import * as React from 'react';

import Box from '@wcpos/components/src/box';
import { EdittableText } from '@wcpos/components/src/edittable-text';

import EditFeeLineButton from './edit-fee-line';
import { useUpdateFeeLine } from '../../hooks/use-update-fee-line';

type FeeLine = import('@wcpos/database').OrderDocument['fee_lines'][number];
interface Props {
	uuid: string;
	item: FeeLine;
	column: import('@wcpos/components/src/table').ColumnProps<FeeLine>;
}

/**
 *
 */
export const FeeName = ({ uuid, item }: Props) => {
	const { updateFeeLine } = useUpdateFeeLine();

	return (
		<Box horizontal space="xSmall" style={{ width: '100%' }}>
			<Box fill>
				<EdittableText weight="bold" onChange={(name) => updateFeeLine(uuid, { name })}>
					{item.name}
				</EdittableText>
			</Box>
			<Box distribution="center">
				<EditFeeLineButton uuid={uuid} item={item} />
			</Box>
		</Box>
	);
};
