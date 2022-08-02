import * as React from 'react';
import { BehaviorSubject, combineLatest } from 'rxjs';
import { tap, switchMap, map, debounceTime } from 'rxjs/operators';
import { ObservableResource, useObservablePickState } from 'observable-hooks';
import useAppState from '@wcpos/hooks/src/use-app-state';
import _map from 'lodash/map';
import _set from 'lodash/set';
import _get from 'lodash/get';
import _forEach from 'lodash/forEach';
import useRestHttpClient from '../use-rest-http-client';
import { getAuditIdReplicationState } from './id-audit';
import { getReplicationState } from './replication';

type TaxRateDocument = import('@wcpos/database/src/collections/taxes').TaxRateDocument;
type SortDirection = import('@wcpos/components/src/table/table').SortDirection;

export interface QueryState {
	// search?: Record<string, unknown>;
	search?: string;
	sortBy: string;
	sortDirection: SortDirection;
	filters?: Record<string, unknown>;
}

export const TaxesContext = React.createContext<{
	query$: BehaviorSubject<QueryState>;
	setQuery: (path: string | string[], value: any) => void;
	resource: ObservableResource<TaxRateDocument[]>;
	runReplication: () => void;
	settings: {
		calc_taxes: 'yes' | 'no';
	};
}>(null);

interface TaxesProviderProps {
	children: React.ReactNode;
	initialQuery: QueryState;
}

const escape = (text: string) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

const TaxesProvider = ({ children, initialQuery }: TaxesProviderProps) => {
	const query$ = React.useMemo(() => new BehaviorSubject(initialQuery), [initialQuery]);
	const { storeDB, store } = useAppState();
	const collection = storeDB.collections.taxes;
	const http = useRestHttpClient();
	const replicationStates = React.useRef({ audit: null, sync: null });
	const settings = useObservablePickState(
		store.$,
		() => ({
			calc_taxes: store?.calc_taxes,
			default_country: store?.default_country,
			prices_include_tax: store?.prices_include_tax,
			store_city: store?.store_city,
			store_postcode: store?.store_postcode,
			tax_display_shop: store?.tax_display_shop,
			tax_round_at_subtotal: store?.tax_round_at_subtotal,
		}),
		'calc_taxes',
		'default_country',
		'prices_include_tax',
		'store_city',
		'store_postcode',
		'tax_display_shop',
		'tax_round_at_subtotal'
	);

	/**
	 *
	 */
	const setQuery = React.useCallback(
		(path, value) => {
			const prev = query$.getValue();
			const next = _set(prev, path, value);
			query$.next(next);
		},
		[query$]
	);

	/**
	 * Start id audit
	 */
	React.useEffect(() => {
		const replicationState = getAuditIdReplicationState(http, collection);
		replicationStates.current.audit = replicationState;

		return function cleanUp() {
			replicationState.then((result) => {
				result.cancel();
			});
		};
	}, [collection, http]);

	/**
	 * Start replication
	 */
	React.useEffect(() => {
		const replicationState = getReplicationState(http, collection);
		replicationStates.current.sync = replicationState;

		return function cleanUp() {
			replicationState.then((result) => {
				result.cancel();
			});
		};
	}, [collection, http]);

	/**
	 *
	 */
	const runReplication = React.useCallback(() => {
		const { audit } = replicationStates.current;

		if (audit) {
			audit.then((result) => {
				result.run();
			});
		}
	}, []);

	/**
	 *
	 */
	const taxes$ = query$.pipe(
		// debounce hits to the local db
		debounceTime(100),
		// switchMap to the collection query
		switchMap((q) => {
			const selector = {};

			// const searchFields = ['username'];
			// if (q.search) {
			// 	selector.$or = searchFields.map((field) => ({
			// 		[field]: { $regex: new RegExp(escape(q.search), 'i') },
			// 	}));
			// }
			// _set(selector, ['username', '$regex'], new RegExp(escape(_get(q, 'search', '')), 'i'));

			const RxQuery = collection.find({ selector });

			return RxQuery.$.pipe(
				// sort the results
				map((result) => result)
				// @ts-ignore
				// map((result) => {
				// 	const array = Array.isArray(result) ? result : [];
				// 	const productSorter = (product: any) => {
				// 		if (q.sortBy === 'name') {
				// 			// @TODO - this doens't work
				// 			return product[q.sortBy].toLowerCase();
				// 		}
				// 		return product[q.sortBy];
				// 	};
				// 	return orderBy(array, [productSorter], [q.sortDirection]);
				// })
			);
		})
	);

	const resource = React.useMemo(() => new ObservableResource(taxes$), [taxes$]);

	/**
	 *
	 */
	const value = React.useMemo(
		() => ({
			query$,
			// query: query$.getValue(),
			setQuery,
			resource,
			runReplication,
			settings,
		}),
		[query$, resource, setQuery, runReplication, settings]
	);

	return <TaxesContext.Provider value={value}>{children}</TaxesContext.Provider>;
};

export default TaxesProvider;
