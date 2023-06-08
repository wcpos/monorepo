import * as React from 'react';

import { orderBy } from '@shelf/fast-natural-order-by';
import isEqual from 'lodash/isEqual';
import { ObservableResource } from 'observable-hooks';
import { switchMap, map, distinctUntilChanged, tap } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import useLocalData from '../../../../contexts/local-data';
import useCollection from '../../hooks/use-collection';
import useQuery, { QueryObservable, QueryState, SetQuery } from '../use-query';
import useReplicationState from '../use-replication-state';

type ProductCategoryDocument =
	import('@wcpos/database/src/collections/categories').ProductCategoryDocument;

export const ProductCategoriesContext = React.createContext<{
	query$: QueryObservable;
	setQuery: SetQuery;
	resource: ObservableResource<ProductCategoryDocument[]>;
	sync: () => void;
}>(null);

interface ProductCategoriesProviderProps {
	children: React.ReactNode;
	initialQuery?: QueryState;
	uiSettings: import('../ui-settings').UISettingsDocument;
}

interface APIQueryParams {
	context?: 'view' | 'edit';
	page?: number;
	per_page?: number;
	search?: string;
	exclude?: number[];
	include?: number[];
	order?: 'asc' | 'desc';
	orderby?: 'id' | 'include' | 'name' | 'slug' | 'term_group' | 'description' | 'count';
	hide_empty?: boolean;
	parent?: number;
	product?: number;
	slug?: string;
}

/**
 *
 */
const prepareQueryParams = (
	params: APIQueryParams,
	query: QueryState,
	status,
	batchSize
): APIQueryParams => {
	/**
	 * FIXME: category has no modified after and will keep fetching over and over
	 */
	if (params.modified_after) {
		params.earlyReturn = true;
	}
	return params;
};

const ProductCategoriesProvider = ({
	children,
	initialQuery,
	ui,
}: ProductCategoriesProviderProps) => {
	const { storeDB } = useLocalData();
	const { collection } = useCollection('products/categories');
	const { query$, setQuery } = useQuery(initialQuery, 'products/categories');
	const replicationState = useReplicationState({ collection, query$, prepareQueryParams });

	/**
	 *
	 */
	const value = React.useMemo(() => {
		const resource$ = query$.pipe(
			switchMap((query) => {
				const { search, selector: querySelector, sortBy, sortDirection } = query;
				const selector = { $and: [] };

				if (search) {
					selector.$and.push({
						$or: [
							{ uuid: search },
							{ id: { $regex: new RegExp(escape(search), 'i') } },
							{ name: { $regex: new RegExp(escape(search), 'i') } },
						],
					});
				}

				if (querySelector) {
					selector.$and.push(querySelector);
				}

				const RxQuery = collection.find({ selector });

				return RxQuery.$.pipe(
					map((result) => {
						return orderBy(result, [sortBy], [sortDirection]);
					}),
					distinctUntilChanged((prev, next) => {
						// only emit when the uuids change
						return isEqual(
							prev.map((doc) => doc.uuid),
							next.map((doc) => doc.uuid)
						);
					})
				);
			})
		);

		return {
			query$,
			setQuery,
			resource: new ObservableResource(resource$),
			replicationState,
		};
	}, [query$, setQuery, replicationState, collection]);

	return (
		<ProductCategoriesContext.Provider value={{ ...value, collection }}>
			{children}
		</ProductCategoriesContext.Provider>
	);
};

export default ProductCategoriesProvider;
