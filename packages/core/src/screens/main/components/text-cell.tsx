import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/components/text';

import type { CellContext } from '@tanstack/react-table';

/**
 *
 */
export function TextCell({ row, column }: CellContext<any, string>) {
	const item = row.original.document;
	const value = useObservableEagerState(item[`${column.id}$`]);

	return <Text>{value == null ? '' : String(value)}</Text>;
}
