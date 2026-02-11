import * as React from 'react';

import { Text } from '@wcpos/components/text';

import type { CellContext } from '@tanstack/react-table';

export function SKU({ row, column }: CellContext<any, string>) {
	const item = row.original.item;

	return <Text>{item[column.id] ? String(item[column.id]) : ''}</Text>;
}
