import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { Observable, of } from 'rxjs';

import { Text } from '@wcpos/components/src/text';

import type { CellContext } from '@tanstack/react-table';

/**
 *
 */
export const TextCell = ({ row, column }: CellContext<any, string>) => {
	const item = row.original.document;
	const textObservable = item[column.id + '$'] as Observable<string> | undefined;
	const text = useObservableEagerState(textObservable ? textObservable : of(null));

	return <Text>{text ? String(text) : ''}</Text>;
};
