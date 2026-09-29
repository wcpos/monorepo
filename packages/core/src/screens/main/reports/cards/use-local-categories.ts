import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { type Observable, of, startWith, switchMap } from 'rxjs';

import { observeEngineQuery, useQueryRuntime } from '@wcpos/query';

import type { CategoryTree, LocalCategory } from '../margin';

export function useLocalCategories(ids: number[]) {
	const { engine, locale } = useQueryRuntime();
	const key = [...new Set(ids)].sort((a, b) => a - b).join(',');
	const source = React.useMemo(() => {
		const read = (
			wanted: number[],
			held: CategoryTree,
			round: number
		): Observable<CategoryTree> => {
			if (!wanted.length) return of(held);
			return observeEngineQuery(engine, locale, {
				collection: 'products/categories',
				selector: { id: { $in: wanted } },
				limit: Number.MAX_SAFE_INTEGER,
			}).pipe(
				switchMap((result) => {
					const tree = new Map(held);
					for (const { record } of result.hits) {
						const node = record.payload as LocalCategory;
						tree.set(node.id, node);
					}
					const parents = [
						...new Set(
							[...tree.values()].flatMap((node) =>
								node.parent && !tree.has(node.parent) && !wanted.includes(node.parent)
									? [node.parent]
									: []
							)
						),
					];
					return round < 3 ? read(parents, tree, round + 1) : of(tree);
				})
			);
		};
		return read(key ? key.split(',').map(Number) : [], new Map(), 1).pipe(startWith(undefined));
	}, [engine, locale, key]);
	return useObservableState(source);
}
