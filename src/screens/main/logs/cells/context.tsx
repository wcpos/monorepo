import * as React from 'react';

import { CellContext } from '@tanstack/react-table';

import { Tree } from '@wcpos/components/src/tree';

type LogDocument = import('@wcpos/database').LogDocument;

/**
 *
 */
export const Context = ({ row }: CellContext<LogDocument, 'context'>) => {
	const log = row.original;

	return <Tree value={log.context} collapsed />;
};
