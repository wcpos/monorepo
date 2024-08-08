import * as React from 'react';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import { useT } from '../../../../../contexts/translations';

type ProductTagDocument = import('@wcpos/database').ProductTagDocument;

interface TagSelectItemProps {
	tag: ProductTagDocument;
}

export const EmptyTableRow = () => {
	const t = useT();

	return (
		<Box horizontal fill padding="small">
			<Text>{t('No tags found', { _tags: 'core' })}</Text>
		</Box>
	);
};

const TagSelectItem = ({ tag }: TagSelectItemProps) => {
	return (
		<Box horizontal fill>
			<Text>{tag.name}</Text>
		</Box>
	);
};

export default TagSelectItem;
