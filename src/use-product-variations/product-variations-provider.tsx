import * as React from 'react';
import { BehaviorSubject, combineLatest } from 'rxjs';
import { tap, switchMap, map, debounceTime } from 'rxjs/operators';
import { ObservableResource, useObservableState } from 'observable-hooks';
import useStore from '@wcpos/hooks/src/use-store';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import _map from 'lodash/map';
import _set from 'lodash/set';
import _get from 'lodash/get';
import { orderBy } from '@shelf/fast-natural-order-by';
import useRestHttpClient from '../use-rest-http-client';
import { getAuditIdReplicationState } from './id-audit';
import { getReplicationState } from './replication';

type ProductVariationDocument =
	import('@wcpos/database/src/collections/variations').ProductVariationDocument;
type ProductDocument = import('@wcpos/database/src/collections/products').ProductDocument;
type SortDirection = import('@wcpos/components/src/table').SortDirection;

export interface QueryState {
	search?: string;
	sortBy: string;
	sortDirection: SortDirection;
	filters?: Record<string, unknown>;
}

export const ProductVariationsContext = React.createContext<{
	// query$: BehaviorSubject<QueryState>;
	// setQuery: (path: string | string[], value: any) => void;
	resource: ObservableResource<ProductVariationDocument[]>;
	sync: () => void;
}>(null);

interface ProductVariationsProviderProps {
	children: React.ReactNode;
	parent: ProductDocument;
	ui: import('@wcpos/hooks/src/use-store').UIDocument;
}

const escape = (text: string) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

const ProductVariationsProvider = ({ children, parent, ui }: ProductVariationsProviderProps) => {
	// const query$ = React.useMemo(() => new BehaviorSubject(initialQuery), [initialQuery]);
	const { storeDB } = useStore();
	const collection = storeDB.collections.variations;
	const http = useRestHttpClient();
	const replicationStates = React.useRef({ audit: null, sync: null });
	const showOutOfStock = useObservableState(ui.get$('showOutOfStock'), ui.get('showOutOfStock'));
	const variationIds = useObservableState(parent.variations$, parent.variations);

	/**
	 *
	 */
	// const setQuery = React.useCallback(
	// 	(path, value) => {
	// 		const prev = _cloneDeep(query$.getValue()); // query needs to be immutable
	// 		const next = _set(prev, path, value);
	// 		query$.next(next);
	// 	},
	// 	[query$]
	// );

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
	const sync = React.useCallback(() => {
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
	const variations$ = collection
		.findByIds$(variationIds?.map((id) => String(id)) || [])
		.pipe(map((docsMap) => Array.from(docsMap.values())));

	const resource = React.useMemo(() => new ObservableResource(variations$), [variations$]);

	/**
	 *
	 */
	const value = React.useMemo(
		() => ({
			// query$,
			// query: query$.getValue(),
			// setQuery,
			resource,
			sync,
		}),
		[resource, sync]
	);

	useWhyDidYouUpdate('ProductsProvider', {
		value,
		// query$,
		resource,
		// setQuery,
		// products$,
		storeDB,
		collection,
		http,
		replicationStates,
		showOutOfStock,
		sync,
	});

	return (
		<ProductVariationsContext.Provider value={value}>{children}</ProductVariationsContext.Provider>
	);
};

export default ProductVariationsProvider;
