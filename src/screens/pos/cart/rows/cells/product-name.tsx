import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Text from '@wcpos/common/src/components/text';
import Box from '@wcpos/common/src/components/box';

interface Props {
	item: import('@wcpos/common/src/database').LineItemDocument;
}

const ProductName = ({ item }: Props) => {
	const name = useObservableState(item.name$, item.name);
	const metaData = useObservableState(item.meta_data$, item.meta_data) || [];

	// filter out the meta data that is not a product attribute
	const attributes = metaData.filter((meta) => {
		if (meta.key) {
			return !meta.key.startsWith('_');
		}
		return true;
	});

	return (
		<Box space="xSmall">
			<Text>{name}</Text>
			{attributes.map((meta) => (
				<Box space="xxSmall" key={meta.key} horizontal>
					<Text size="small" type="secondary">{`${meta.display_key}:`}</Text>
					<Text size="small">{meta.display_value}</Text>
				</Box>
			))}
		</Box>
	);
};

export default ProductName;
