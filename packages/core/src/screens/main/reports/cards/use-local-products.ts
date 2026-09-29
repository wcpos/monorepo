import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { map, startWith } from 'rxjs';

import { observeEngineQuery, useQueryRuntime } from '@wcpos/query';

import type { LocalProduct } from './aggregate';

export function useLocalProducts(ids: number[]) {
	const { engine, locale } = useQueryRuntime();
	const key = [...new Set(ids)].sort((a, b) => a - b).join(',');
	const source = React.useMemo(
		() =>
			observeEngineQuery(engine, locale, {
				collection: 'products',
				selector: { id: { $in: key ? key.split(',').map(Number) : [] } },
				limit: Number.MAX_SAFE_INTEGER,
			}).pipe(
				map((result) => result.hits.map(({ record }) => record.payload as LocalProduct)),
				startWith(undefined)
			),
		[engine, locale, key]
	);
	return useObservableState(source);
}
