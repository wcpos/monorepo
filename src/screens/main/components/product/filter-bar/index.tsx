import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { of } from 'rxjs';
import { startWith, switchMap, tap } from 'rxjs/operators';

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

	/**
	 * TODO - this is a bit of a hack, but it works for now.
	 */
	const selectedCategoryResource = React.useMemo(() => {
		const selectedCategory$ = query.params$.pipe(
			startWith(query.getElemMatchId('categories')),
			switchMap(() => {
				const categoryFilterID = query.getElemMatchId('categories');
				if (categoryFilterID) {
					return categoryCollection.findOne({ selector: { id: categoryFilterID } }).$.pipe(
						tap((doc) => {
							if (!isRxDocument(doc)) {
								pullDocument(categoryFilterID, categoryCollection);
							}
						})
					);
				}
				return of(undefined);
			})
		);

		return new ObservableResource(selectedCategory$);
	}, [categoryCollection, pullDocument, query]);

	/**
	 *
	 */
	const selectedTagResource = React.useMemo(() => {
		const selectedTag$ = query.params$.pipe(
			startWith(query.getElemMatchId('tags')),
			switchMap(() => {
				const tagFilterID = query.getElemMatchId('tags');
				if (tagFilterID) {
					return tagCollection.findOne({ selector: { id: tagFilterID } }).$.pipe(
						tap((doc) => {
							if (!isRxDocument(doc)) {
								pullDocument(tagFilterID, tagCollection);
							}
						})
					);
				}
				return of(undefined);
			})
		);

		return new ObservableResource(selectedTag$);
	}, [pullDocument, query, tagCollection]);

	/**
	 *
	 */
	return (
		<HStack className="w-full flex-wrap">
			<StockStatusPill query={query} />
			<FeaturedPill query={query} />
			<OnSalePill query={query} />
			<Suspense>
				<CategoryPill query={query} resource={selectedCategoryResource} />
			</Suspense>
			<Suspense>
				<TagPill query={query} resource={selectedTagResource} />
			</Suspense>
		</HStack>
	);
};

export default FilterBar;
