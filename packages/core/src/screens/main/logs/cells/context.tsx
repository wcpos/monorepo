import * as React from 'react';

import { CellContext } from '@tanstack/react-table';

import { Tree } from '@wcpos/components/src/tree';

type LogDocument = import('@wcpos/database').LogDocument;

/**
 *
 */
export const Context = ({ row }: CellContext<{ document: LogDocument }, 'context'>) => {
	const log = row.original.document;

	return <Tree value={log.context} collapsed />;
};
