import * as React from 'react';

import { CellContext } from '@tanstack/react-table';

import { Tree } from '@wcpos/tailwind/src/tree';

type LogDocument = import('@wcpos/database').LogDocument;

/**
 *
 */
export const Context = ({ row }: CellContext<LogDocument, 'context'>) => {
	return (
		<Tree data={log.context} hideRoot shouldExpandNodeInitially={() => false} rawToggle={false} />
	);
};
