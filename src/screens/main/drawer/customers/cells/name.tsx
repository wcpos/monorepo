import * as React from 'react';

import Text from '@wcpos/components/src/text';

type Props = {
	item: import('@wcpos/database').CustomerDocument;
	column: import('@wcpos/components/src/table').ColumnProps;
};

const Name = ({ item: customer, column }: Props) => {
	const name = customer[column.key];

	return name !== undefined ? <Text>{name}</Text> : <Text.Skeleton />;
};

export default Name;
