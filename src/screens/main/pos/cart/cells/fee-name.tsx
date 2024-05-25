import * as React from 'react';

import Box from '@wcpos/components/src/box';
import { EdittableText } from '@wcpos/components/src/edittable-text';
import Text from '@wcpos/components/src/text';

import { EditButton } from './edit-button';
import { EditFeeLineModal } from './edit-fee-line';
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

	/**
	 * filter out the private meta data
	 */
	const metaData = React.useMemo(
		() =>
			item.meta_data.filter((meta) => {
				if (meta.key) {
					return !meta.key.startsWith('_');
				}
				return true;
			}),
		[item.meta_data]
	);

	return (
		<Box horizontal space="xSmall" style={{ width: '100%' }}>
			<Box fill space="xSmall">
				<EdittableText weight="bold" onChange={(name) => updateFeeLine(uuid, { name })}>
					{item.name}
				</EdittableText>

				{metaData.map((meta) => {
					return (
						<Box space="xxSmall" key={meta.id || meta.display_key || meta.key} horizontal>
							<Text size="small" type="secondary">{`${meta.key}:`}</Text>
							<Text size="small">{meta.value}</Text>
						</Box>
					);
				})}
			</Box>
			<Box distribution="center">
				<EditButton uuid={uuid} item={item} Modal={EditFeeLineModal} />
			</Box>
		</Box>
	);
};
