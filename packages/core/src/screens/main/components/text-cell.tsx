import * as React from 'react';

import { Text } from '@wcpos/components/src/text';

import type { CellContext } from '@tanstack/react-table';

/**
 *
 */
export const TextCell = ({ row, column }: CellContext<any, string>) => {
	const item = row.original.document;

	return <Text>{item[column.id] ? String(item[column.id]) : ''}</Text>;
};
