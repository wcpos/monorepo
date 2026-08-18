import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/components/text';
import type { CellContext } from '@wcpos/core/table-types';

import type { TableFeatures } from '@tanstack/react-table';

/**
 *
 */
export function TextCell<
	TFeatures extends TableFeatures,
	TData extends { document: Record<string, unknown> },
>({ row, column }: CellContext<TData, string, TFeatures>) {
	const item = row.original.document;
	const value = useObservableEagerState(
		item[`${column.id}$`] as import('rxjs').Observable<unknown>
	);

	return <Text>{value == null ? '' : String(value)}</Text>;
}
