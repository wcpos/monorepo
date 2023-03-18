import * as React from 'react';

import _get from 'lodash/get';
import _set from 'lodash/set';
import { ObservableResource } from 'observable-hooks';
import { switchMap, map, debounceTime, tap, distinctUntilChanged } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import { useReplication } from './use-replication';
import useLocalData from '../../../../contexts/local-data';
import useQuery, { QueryObservable, QueryState, SetQuery } from '../use-query';

type PaymentGatewayDocument =
	import('@wcpos/database/src/collections/payment-gateways').PaymentGatewayDocument;

export const GatewaysContext = React.createContext<{
	// query$: QueryObservable;
	// setQuery: SetQuery;
	resource: ObservableResource<PaymentGatewayDocument[]>;
	sync: () => void;
}>(null);

interface GatewaysProviderProviderProps {
	children: React.ReactNode;
	initialQuery: QueryState;
	// ui?: import('../../contexts/ui').UISettingsDocument;
}

const GatewaysProvider = ({ children, initialQuery }: GatewaysProviderProviderProps) => {
	log.debug('render gateways provider');
	const { storeDB } = useLocalData();
	const collection = storeDB.collections.payment_gateways;
	const { query$, setQuery } = useQuery(initialQuery);
	const replicationState = useReplication({ collection });

	/**
	 * Only run the replication when the Provider is mounted
	 */
	React.useEffect(() => {
		replicationState.start();
		return () => {
			// this is async, should we wait?
			replicationState.cancel();
		};
	}, [replicationState]);

	/**
	 *
	 */
	const value = React.useMemo(() => {
		const gateways$ = query$.pipe(
			switchMap((query) => {
				const { search, selector = {}, sortBy, sortDirection } = query;

				const RxQuery = collection.find({ selector, sort: [{ order: 'asc' }] });

				return RxQuery.$;
			})
		);

		return {
			resource: new ObservableResource(gateways$),
			replicationState,
		};
	}, [collection, query$, replicationState]);

	return <GatewaysContext.Provider value={value}>{children}</GatewaysContext.Provider>;
};

export default GatewaysProvider;
