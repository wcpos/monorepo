import * as React from 'react';

import { Tree } from '@wcpos/tailwind/src/tree';

interface Props {
	item: import('@wcpos/database').LogDocument;
	column: import('@wcpos/tailwind/src/table').ColumnProps;
}

export const Context = ({ item: log, column }: Props) => {
	return (
		<Tree data={log.context} hideRoot shouldExpandNodeInitially={() => false} rawToggle={false} />
	);
};
