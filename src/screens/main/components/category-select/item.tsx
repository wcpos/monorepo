import * as React from 'react';

import { Avatar } from '@wcpos/components/src/avatar/avatar';
import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import { t } from '../../../../lib/translations';

type ProductCategoryDocument = import('@wcpos/database').ProductCategoryDocument;

interface CategorySelectItemProps {
	category: ProductCategoryDocument;
}

export const EmptyTableRow = () => {
	return (
		<Box horizontal fill padding="small">
			<Text>{t('No categories found', { _tags: 'core' })}</Text>
		</Box>
	);
};

const CategorySelectItem = ({ category }: CategorySelectItemProps) => {
	return (
		<Box horizontal space="small" fill>
			<Text>{category.name}</Text>
		</Box>
	);
};

export default CategorySelectItem;
