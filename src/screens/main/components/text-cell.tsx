import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { Observable, of } from 'rxjs';

import type { CellContext } from '@wcpos/tailwind/src/data-table';
import { Text } from '@wcpos/tailwind/src/text';

/**
 *
 */
export const TextCell = ({ row, column }: CellContext<any, string>) => {
	const item = row.original;
	const textObservable = item[column.id + '$'] as Observable<string> | undefined;
	const text = useObservableEagerState(textObservable ? textObservable : of(null));

	return <Text>{String(text)}</Text>;
};
