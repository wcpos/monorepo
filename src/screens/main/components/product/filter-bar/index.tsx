import * as React from 'react';

import get from 'lodash/get';
import { ObservableResource } from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { of } from 'rxjs';
import { startWith, switchMap, tap } from 'rxjs/operators';

import Box from '@wcpos/components/src/box';
import Suspense from '@wcpos/components/src/suspense';

import CategoryPill from './category-pill';
import FeaturedPill from './featured-pill';
import OnSalePill from './on-sale-pill';
import TagPill from './tag-pill';
import usePullDocument from '../../../contexts/use-pull-document';
import { useCollection } from '../../../../../hooks/use-collection';

/**
 *
 */
const FilterBar = ({ query }) => {
	const { collection: categoryCollection } = useCollection('products/categories');
	const { collection: tagCollection } = useCollection('products/tags');
	const pullDocument = usePullDocument();

	/**
	 * TODO - this is a bit of a hack, but it works for now.
	 */
	const selectedCategoryResource = React.useMemo(() => {
		const selectedCategory$ = query.state$.pipe(
			startWith(get(query, ['currentState', 'selector', 'categories', '$elemMatch', 'id'])),
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
	}, [categoryCollection, pullDocument, query]);

	/**
	 *
	 */
	const selectedTagResource = React.useMemo(() => {
		const selectedTag$ = query.state$.pipe(
			startWith(get(query, ['currentState', 'selector', 'tags', '$elemMatch', 'id'])),
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
	}, [pullDocument, query, tagCollection]);

	/**
	 *
	 */
	return (
		<Box space="small" horizontal>
			<FeaturedPill query={query} />
			<OnSalePill query={query} />
			<Suspense>
				<CategoryPill query={query} resource={selectedCategoryResource} />
			</Suspense>
			<Suspense>
				<TagPill query={query} resource={selectedTagResource} />
			</Suspense>
		</Box>
	);
};

export default FilterBar;
