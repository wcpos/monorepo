import * as React from 'react';

import get from 'lodash/get';
import { useObservableState, ObservableResource, useObservable } from 'observable-hooks';
import { of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import Box from '@wcpos/components/src/box';

import CategoryPill from './category-pill';
import FeaturedPill from './featured-pill';
import OnSalePill from './on-sale-pill';
import TagPill from './tag-pill';
import useProducts from '../../../contexts/products';
import useCollection from '../../../hooks/use-collection';

const FilterBar = () => {
	const { query$, setQuery } = useProducts();
	const query = useObservableState(query$, query$.getValue());
	const featuredFilterActive = get(query, 'selector.featured', false);
	const onSaleFilterActive = get(query, 'selector.on_sale', false);
	const categoryFilterID = get(query, ['selector', 'categories', '$elemMatch', 'id']);
	const tagFilterID = get(query, ['selector', 'tags', '$elemMatch', 'id']);
	const { collection: categoryCollection } = useCollection('products/categories');
	const { collection: tagCollection } = useCollection('products/tags');
	// const pullDocument = usePullDocument();

	/**
	 *
	 */
	const selectedCategory$ = useObservable(
		(input$) =>
			input$.pipe(
				switchMap(([catID]) =>
					catID ? categoryCollection.findOne({ selector: { id: catID } }).$ : of(undefined)
				)
			),
		[categoryFilterID]
	);

	/**
	 *
	 */
	const selectedCategoryResource = React.useMemo(() => {
		return new ObservableResource(selectedCategory$);
	}, [selectedCategory$]);

	/**
	 *
	 */
	const selectedTag$ = useObservable(
		(input$) =>
			input$.pipe(
				switchMap(([tagID]) =>
					tagID ? tagCollection.findOne({ selector: { id: tagID } }).$ : of(undefined)
				)
			),
		[tagFilterID]
	);

	/**
	 *
	 */
	const selectedTagResource = React.useMemo(() => {
		return new ObservableResource(selectedTag$);
	}, [selectedTag$]);

	/**
	 *
	 */
	return (
		<Box space="small" horizontal>
			<FeaturedPill active={featuredFilterActive} setQuery={setQuery} />
			<OnSalePill active={onSaleFilterActive} setQuery={setQuery} />
			<React.Suspense>
				<CategoryPill selectedCategoryResource={selectedCategoryResource} setQuery={setQuery} />
			</React.Suspense>
			<React.Suspense>
				<TagPill selectedTagResource={selectedTagResource} setQuery={setQuery} />
			</React.Suspense>
		</Box>
	);
};

export default FilterBar;
