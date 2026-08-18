import * as React from 'react';

import { Text } from '@wcpos/components/text';
import type { CellContext } from '@wcpos/core/table-types';

export function SKU({ row, column }: CellContext<any, string>) {
	const item = row.original.item;

	return <Text>{item[column.id] == null ? '' : String(item[column.id])}</Text>;
}
