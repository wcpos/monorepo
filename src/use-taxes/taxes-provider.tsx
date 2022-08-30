import * as React from 'react';
import { BehaviorSubject, combineLatest } from 'rxjs';
import { tap, switchMap, map, debounceTime } from 'rxjs/operators';
import { ObservableResource, useObservablePickState } from 'observable-hooks';
import useStore from '@wcpos/hooks/src/use-store';
import useOnlineStatus from '@wcpos/hooks/src/use-online-status';
import _map from 'lodash/map';
import _set from 'lodash/set';
import _get from 'lodash/get';
import _cloneDeep from 'lodash/cloneDeep';
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

const replicationMap = new Map();

const TaxesProvider = ({ children, initialQuery }: TaxesProviderProps) => {
	const query$ = React.useMemo(() => new BehaviorSubject(initialQuery), [initialQuery]);
	const { storeDB, store } = useStore();
	const collection = storeDB.collections.taxes;
	const http = useRestHttpClient();
	const { isConnected } = useOnlineStatus();
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
			const prev = _cloneDeep(query$.getValue());
			const next = _set(prev, path, value);
			query$.next(next);
		},
		[query$]
	);

	/**
	 *
	 */
	React.useEffect(() => {
		if (!isConnected) {
			replicationMap.forEach((replicationState) => {
				replicationState.then((result) => {
					result.cancel();
				});
			});
		}
	}, [isConnected]);

	/**
	 * Start replication
	 * - audit id (checks for deleted or new ids on server)
	 * - replication (syncs all data and checks for modified data)
	 */
	React.useEffect(() => {
		if (!replicationMap.get('audit')) {
			replicationMap.set('audit', getAuditIdReplicationState(http, collection));
		}

		if (!replicationMap.get('sync')) {
			replicationMap.set('sync', getReplicationState(http, collection));
		}

		return function cleanUp() {
			replicationMap.forEach((replicationState) => {
				replicationState.then((result) => {
					result.cancel();
				});
			});
		};
	}, [collection, http]);

	/**
	 *
	 */
	const sync = React.useCallback(() => {
		const audit = replicationMap.get('audit');

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
			sync,
			settings,
		}),
		[query$, resource, setQuery, sync, settings]
	);

	return <TaxesContext.Provider value={value}>{children}</TaxesContext.Provider>;
};

export default TaxesProvider;
