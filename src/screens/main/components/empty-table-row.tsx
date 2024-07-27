import * as React from 'react';

import { Box } from '@wcpos/tailwind/src/box';
import { Text } from '@wcpos/tailwind/src/text';

import { useT } from '../../../contexts/translations';

interface EmptyTableRowProps {
	message?: string;
}

const EmptyTableRow = ({ message }: EmptyTableRowProps) => {
	const t = useT();

	return (
		<Box>
			<Text>{message || t('No results found', { _tags: 'core' })}</Text>
		</Box>
	);
};

export default EmptyTableRow;
