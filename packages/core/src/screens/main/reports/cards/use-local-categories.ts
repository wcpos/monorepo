import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { type Observable, of, startWith, switchMap } from 'rxjs';

import { observeLocalRecordsById, useQueryRuntime } from '@wcpos/query';

import type { CategoryTree, LocalCategory } from '../margin';

export function useLocalCategories(ids: number[]) {
	const runtime = useQueryRuntime();
	const key = [...new Set(ids)].sort((a, b) => a - b).join(',');
	const source = React.useMemo(() => {
		const read = (
			wanted: number[],
			held: CategoryTree,
			round: number
		): Observable<CategoryTree> => {
			if (!wanted.length) return of(held);
			return observeLocalRecordsById(runtime.engine, 'products/categories', wanted).pipe(
				switchMap((result) => {
					const tree = new Map(held);
					for (const record of result) {
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
	}, [runtime.engine, runtime.locale, key]);
	return useObservableState(source);
}
