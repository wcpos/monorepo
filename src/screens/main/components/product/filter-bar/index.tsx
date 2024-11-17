import * as React from 'react';

import { ObservableResource, useObservable, useObservableEagerState } from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { of } from 'rxjs';
import { startWith, switchMap, tap, map } from 'rxjs/operators';

import { HStack } from '@wcpos/components/src/hstack';
import { Suspense } from '@wcpos/components/src/suspense';
import type { Query } from '@wcpos/query';

import { CategoryPill } from './category-pill';
import FeaturedPill from './featured-pill';
import OnSalePill from './on-sale-pill';
import { StockStatusPill } from './stock-status-pill';
import { TagPill } from './tag-pill';
import usePullDocument from '../../../contexts/use-pull-document';
import { useCollection } from '../../../hooks/use-collection';

type ProductCollection = import('@wcpos/database').ProductCollection;

interface Props {
	query: Query<ProductCollection>;
}

/**
 *
 */
const FilterBar = ({ query }: Props) => {
	const { collection: categoryCollection } = useCollection('products/categories');
	const { collection: tagCollection } = useCollection('products/tags');
	const pullDocument = usePullDocument();
	const selectedCategoryID = useObservableEagerState(
		query.rxQuery$.pipe(map(() => query.getElemMatchId('categories')))
	);
	const selectedTagID = useObservableEagerState(
		query.rxQuery$.pipe(map(() => query.getElemMatchId('tags')))
	);

	const selectedCategory$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap(([id]) => {
					if (!id) {
						return of(undefined);
					}
					return categoryCollection.findOne({ selector: { id } }).$.pipe(
						tap((doc) => {
							if (!isRxDocument(doc)) {
								pullDocument(id, categoryCollection);
							}
						})
					);
				})
			),
		[selectedCategoryID]
	);

	const selectedCategoryResource = React.useMemo(
		() => new ObservableResource(selectedCategory$),
		[selectedCategory$]
	);

	const selectedTag$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap(([id]) => {
					if (!id) {
						return of(undefined);
					}
					return tagCollection.findOne({ selector: { id } }).$.pipe(
						tap((doc) => {
							if (!isRxDocument(doc)) {
								pullDocument(id, tagCollection);
							}
						})
					);
				})
			),
		[selectedTagID]
	);

	const selectedTagResource = React.useMemo(
		() => new ObservableResource(selectedTag$),
		[selectedTag$]
	);

	/**
	 *
	 */
	return (
		<HStack className="w-full flex-wrap">
			<StockStatusPill query={query} />
			<FeaturedPill query={query} />
			<OnSalePill query={query} />
			<Suspense>
				<CategoryPill
					query={query}
					resource={selectedCategoryResource}
					selectedID={selectedCategoryID}
				/>
			</Suspense>
			<Suspense>
				<TagPill query={query} resource={selectedTagResource} selectedID={selectedTagID} />
			</Suspense>
		</HStack>
	);
};

export default FilterBar;
