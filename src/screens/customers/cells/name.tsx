import * as React from 'react';
import Text from '@wcpos/common/src/components/text';

type Props = {
	item: import('@wcpos/common/src/database').CustomerDocument;
	column: import('@wcpos/common/src/components/table/types').ColumnProps;
};

const Name = ({ item: customer, column }: Props) => {
	const name = customer[column.key];

	return name !== undefined ? <Text>{name}</Text> : <Text.Skeleton />;
};

export default Name;
