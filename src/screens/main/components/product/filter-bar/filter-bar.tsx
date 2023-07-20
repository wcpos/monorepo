import * as React from 'react';

import get from 'lodash/get';
import { ObservableResource } from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { of } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';

import Box from '@wcpos/components/src/box';

import CategoryPill from './category-pill';
import FeaturedPill from './featured-pill';
import OnSalePill from './on-sale-pill';
import TagPill from './tag-pill';
import { useProducts } from '../../../contexts/products';
import usePullDocument from '../../../contexts/use-pull-document';
import useCollection from '../../../hooks/use-collection';

const FilterBar = () => {
	const { query$ } = useProducts();
	const { collection: categoryCollection } = useCollection('products/categories');
	const { collection: tagCollection } = useCollection('products/tags');
	const pullDocument = usePullDocument();

	/**
	 *
	 */
	const selectedCategoryResource = React.useMemo(() => {
		const selectedCategory$ = query$.pipe(
			switchMap((query) => {
				const categoryFilterID = get(query, ['selector', 'categories', '$elemMatch', 'id']);
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
	}, [categoryCollection, pullDocument, query$]);

	/**
	 *
	 */
	const selectedTagResource = React.useMemo(() => {
		const selectedTag$ = query$.pipe(
			switchMap((query) => {
				const tagFilterID = get(query, ['selector', 'tags', '$elemMatch', 'id']);
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
	}, [pullDocument, query$, tagCollection]);

	/**
	 *
	 */
	return (
		<Box space="small" horizontal>
			<FeaturedPill />
			<OnSalePill />
			<React.Suspense>
				<CategoryPill resource={selectedCategoryResource} />
			</React.Suspense>
			<React.Suspense>
				<TagPill resource={selectedTagResource} />
			</React.Suspense>
		</Box>
	);
};

export default FilterBar;
