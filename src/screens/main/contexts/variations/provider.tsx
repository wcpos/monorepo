import * as React from 'react';

import get from 'lodash/get';
import isEqual from 'lodash/isEqual';
import set from 'lodash/set';
import { ObservableResource, useObservableState } from 'observable-hooks';
import { combineLatest } from 'rxjs';
import { switchMap, map, distinctUntilChanged } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import { filterVariationsByAttributes } from './query.helpers';
import useCollection from '../../hooks/use-collection';
import useQuery, { QueryObservable, QueryState, SetQuery } from '../use-query';
import useReplicationState from '../use-replication-state';

import type { AuditStatus } from '../use-replication-state/use-audit';

type ProductVariationDocument =
	import('@wcpos/database/src/collections/variations').ProductVariationDocument;
type ProductDocument = import('@wcpos/database/src/collections/products').ProductDocument;

export const VariationsContext = React.createContext<{
	query$: QueryObservable;
	setQuery: SetQuery;
	resource: ObservableResource<ProductVariationDocument[]>;
	sync: () => void;
	replicationState: import('../use-replication-state').ReplicationState;
}>(null);

interface VariationsProviderProps {
	children: React.ReactNode;
	initialQuery?: QueryState;
	parent: ProductDocument;
	// uiSettings?: import('../ui-settings').UISettingsDocument;
}

interface APIQueryParams {
	context?: 'view' | 'edit';
	page?: number;
	per_page?: number;
	search?: string;
	after?: string;
	before?: string;
	exclude?: number[];
	include?: number[];
	offset?: number;
	order?: 'asc' | 'desc';
	orderby?: 'date' | 'id' | 'include' | 'title' | 'slug';
	parent?: number[];
	parent_exclude?: number[];
	slug?: string;
	status?: 'any' | 'draft' | 'pending' | 'private' | 'publish';
	sku?: string;
	tax_class?: 'standard' | 'reduced-rate' | 'zero-rate';
	on_sale?: boolean;
	min_price?: string;
	max_price?: string;
	stock_status?: 'instock' | 'outofstock' | 'onbackorder';
}

/**
 *
 */
const prepareQueryParams = (
	params: APIQueryParams,
	query: QueryState,
	status: AuditStatus,
	batchSize: number
): APIQueryParams => {
	let orderby = params.orderby;

	if (query.sortBy === 'name') {
		orderby = 'title';
	}

	return {
		...params,
		orderby,
	};
};

/**
 *
 */
const VariationsProvider = ({
	children,
	initialQuery,
	parent,
}: // uiSettings,
VariationsProviderProps) => {
	const { collection } = useCollection('variations');
	const apiEndpoint = `products/${parent.id}/variations`;
	const { query$, setQuery } = useQuery(initialQuery);
	// const replicationState = useReplication({ parent, query$ });
	const replicationState = useReplicationState({
		collection,
		query$,
		prepareQueryParams,
		apiEndpoint,
	});

	/**
	 *
	 */
	const resource = React.useMemo(() => {
		const resource$ = combineLatest([query$, parent.variations$]).pipe(
			switchMap(([query, variationIDs]) => {
				const { search, selector: querySelector, sortBy, sortDirection, limit, skip } = query;
				const selector = { $and: [{ id: { $in: variationIDs } }] };

				/**
				 *  $allMatch is not supported so I will have to filter the results
				 */
				const allMatch = get(querySelector, 'attributes.$allMatch', null);

				if (querySelector && !allMatch) {
					selector.$and.push(querySelector);
				}

				const RxQuery = collection.find({ selector });

				/**
				 *  $allMatch is not supported so I will have to filter the results
				 */
				return RxQuery.$.pipe(
					map((result) => {
						if (allMatch) {
							return filterVariationsByAttributes(result, allMatch);
						}
						return result;
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

		return new ObservableResource(resource$);
	}, [collection, parent.variations$, query$]);

	return (
		<VariationsContext.Provider value={{ resource, setQuery, query$, replicationState }}>
			{children}
		</VariationsContext.Provider>
	);
};

export default React.memo(VariationsProvider);
