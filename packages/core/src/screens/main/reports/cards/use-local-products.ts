import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { map, startWith } from 'rxjs';

import { observeLocalRecordsById, useQueryRuntime } from '@wcpos/query';

import type { LocalProduct } from './aggregate';

export const LocalProductsContext = React.createContext<LocalProduct[] | undefined>(undefined);

export function useLocalProducts(ids: number[]) {
	const runtime = useQueryRuntime();
	const key = [...new Set(ids)].sort((a, b) => a - b).join(',');
	const source = React.useMemo(
		() =>
			observeLocalRecordsById(
				runtime.engine,
				'products',
				key ? key.split(',').map(Number) : []
			).pipe(
				map((result) => result.map((record) => record.payload as LocalProduct)),
				startWith(undefined)
			),
		[runtime.engine, runtime.locale, key]
	);
	return useObservableState(source);
}
