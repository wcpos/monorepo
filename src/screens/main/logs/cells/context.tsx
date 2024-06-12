import * as React from 'react';

import Tree from '@wcpos/components/src/tree';

interface Props {
	item: import('@wcpos/database').LogDocument;
	column: import('@wcpos/components/src/table').ColumnProps;
}

export const Context = ({ item: log, column }: Props) => {
	return <Tree rootName="data" data={log.context} rawToggle={false} isCollapsed={() => true} />;
};
