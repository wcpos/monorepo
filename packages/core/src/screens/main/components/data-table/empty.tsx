import * as React from 'react';

import { TableRow } from '@wcpos/components/table';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';

type Props = {
	message: string;
};

export const ListEmptyComponent = ({ message }: Props) => {
	const t = useT();

	return (
		<TableRow className="justify-center p-2">
			<Text>{message ? message : t('No results found', { _tags: 'core' })}</Text>
		</TableRow>
	);
};
