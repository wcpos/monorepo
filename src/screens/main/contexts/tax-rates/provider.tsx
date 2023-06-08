import * as React from 'react';

import sortBy from 'lodash/sortBy';
import { ObservableResource } from 'observable-hooks';
import { switchMap, map, tap } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import { filterTaxRates } from './helpers';
import useLocalData from '../../../../contexts/local-data';
import useCollection from '../../hooks/use-collection';
import useQuery, { QueryObservable, QueryState, SetQuery } from '../use-query';
import useReplicationState from '../use-replication-state';

type TaxRateDocument = import('@wcpos/database/src/collections/tax-rates').TaxRateDocument;

export const TaxRateContext = React.createContext<{
	query$: QueryObservable;
	setQuery: SetQuery;
	resource: ObservableResource<TaxRateDocument[]>;
	sync: () => void;
}>(null);

interface TaxRateProviderProps {
	children: React.ReactNode;
	initialQuery?: QueryState & {
		location?: { country?: string; state?: string; city?: string; postcode?: string };
	};
	uiSettings: import('../ui-settings').UISettingsDocument;
}

interface APIQueryParams {
	context?: 'view' | 'edit';
	page?: number;
	per_page?: number;
	offset?: number;
	order?: 'asc' | 'desc';
	orderby?: 'id' | 'order' | 'priority';
	class?: string;
}

/**
 *
 */
const prepareQueryParams = (params: APIQueryParams, query: QueryState): APIQueryParams => {
	/**
	 * FIXME: tax has no modified after and will keep fetching over and over
	 */
	if (params.modified_after) {
		params.earlyReturn = true;
	}

	/**
	 * FIXME: taxes have no include/exclude, so I'm just going to fetch all of them
	 * 100 should be enough, right?
	 */
	params.per_page = 100;

	return params;
};

const TaxRateProvider = ({ children, initialQuery, ui }: TaxRateProviderProps) => {
	const { storeDB } = useLocalData();
	const { collection } = useCollection('taxes');
	const { query$, setQuery } = useQuery(initialQuery);
	const replicationState = useReplicationState({ collection, query$, prepareQueryParams });

	/**
	 *
	 */
	const resource = React.useMemo(() => {
		const resource$ = query$.pipe(
			switchMap((q) => {
				/**
				 * Matching tax rates is a bit tricky:
				 * - only country and state can be easily matched in the db, so we filter postcode and city afterwards
				 * - if no country is given we should only match wildcard country tax rates
				 * - but we also need a way to return all rates rates, so if location is empty we should return all rates
				 */
				const selector = {};

				// if q.location is an object
				if (q.location) {
					// pick out country, state, city and postcode from q.location
					const { country, state } = q.location;
					selector.$and = [{ $or: [{ country }, { country: '' }] }];
					if (state) {
						selector.$and.push({ $or: [{ state }, { state: '' }] });
					}
				}

				const RxQuery = collection.find({ selector });

				return RxQuery.$.pipe(
					map((result) => {
						if (q.location) {
							const { postcode, city } = q.location;
							return filterTaxRates(result, postcode, city);
						} else {
							return result;
						}
					}),
					map((result) => sortBy(result, 'order'))
				);
			})
		);

		return new ObservableResource(resource$);
	}, [query$, collection]);

	/**
	 *
	 */
	const clear = React.useCallback(async () => {
		// we need to cancel any replications before clearing the collections
		replicationState.cancel();
		await storeDB.reset(['taxes']);
	}, [replicationState, storeDB]);

	/**
	 *
	 */
	const sync = React.useCallback(() => {
		replicationState.reSync();
	}, [replicationState]);

	/**
	 *
	 */
	const value = React.useMemo(
		() => ({ resource, query$, setQuery, replicationState, sync, clear }),
		[clear, query$, replicationState, resource, setQuery, sync]
	);

	/**
	 *
	 */
	return <TaxRateContext.Provider value={value}>{children}</TaxRateContext.Provider>;
};

export default TaxRateProvider;
