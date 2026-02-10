import * as React from 'react';

import { ObservableResource, useObservable, useObservableEagerState } from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { of } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';

import { HStack } from '@wcpos/components/hstack';
import { Suspense } from '@wcpos/components/suspense';
import type { Query } from '@wcpos/query';

import { CategoryPill } from './category-pill';
import { FeaturedPill } from './featured-pill';
import { OnSalePill } from './on-sale-pill';
import { StockStatusPill } from './stock-status-pill';
import { TagPill } from './tag-pill';
import { usePullDocument } from '../../../contexts/use-pull-document';
import { useCollection } from '../../../hooks/use-collection';
import { BrandsPill } from './brands-pill';

type ProductCollection = import('@wcpos/database').ProductCollection;

interface Props {
	query: Query<ProductCollection>;
}

/**
 *
 */
export function FilterBar({ query }: Props) {
	const pullDocument = usePullDocument();
	const { collection: categoryCollection } = useCollection('products/categories');
	const { collection: tagCollection } = useCollection('products/tags');
	const { collection: brandCollection } = useCollection('products/brands');
	const selectedCategoryID = useObservableEagerState(
		query.rxQuery$.pipe(map(() => query.getElemMatchId('categories')))
	);
	const selectedTagID = useObservableEagerState(
		query.rxQuery$.pipe(map(() => query.getElemMatchId('tags')))
	);
	const selectedBrandID = useObservableEagerState(
		query.rxQuery$.pipe(map(() => query.getElemMatchId('brands')))
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
								pullDocument(id, categoryCollection as any);
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
								pullDocument(id, tagCollection as any);
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

	const selectedBrand$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap(([id]) => {
					if (!id) {
						return of(undefined);
					}
					return brandCollection.findOne({ selector: { id } }).$.pipe(
						tap((doc) => {
							if (!isRxDocument(doc)) {
								pullDocument(id, brandCollection as any);
							}
						})
					);
				})
			),
		[selectedBrandID]
	);

	const selectedBrandResource = React.useMemo(
		() => new ObservableResource(selectedBrand$),
		[selectedBrand$]
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
					resource={selectedCategoryResource as any}
					selectedID={selectedCategoryID}
				/>
			</Suspense>
			<Suspense>
				<TagPill query={query} resource={selectedTagResource as any} selectedID={selectedTagID} />
			</Suspense>
			<Suspense>
				<BrandsPill
					query={query}
					resource={selectedBrandResource as any}
					selectedID={selectedBrandID}
				/>
			</Suspense>
		</HStack>
	);
}
