import * as React from 'react';
import { ObservableResource, useObservableState } from 'observable-hooks';
import { switchMap, map, debounceTime, tap, distinctUntilChanged } from 'rxjs/operators';
import useStore from '@wcpos/hooks/src/use-store';
import _set from 'lodash/set';
import _get from 'lodash/get';
// import isEqual from 'lodash/isEqual';
// import { orderBy } from '@shelf/fast-natural-order-by';
// import useQuery, { QueryObservable, QueryState, SetQuery } from '../use-query';
import { useReplication } from './use-replication';

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
	// initialQuery: QueryState;
	// ui?: import('@wcpos/hooks/src/use-store').UIDocument;
}

const GatewaysProvider = ({ children }: GatewaysProviderProviderProps) => {
	console.log('render gateways provider');
	const { storeDB } = useStore();
	const collection = storeDB.collections.payment_gateways;
	// const { query$, setQuery } = useQuery(initialQuery);
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
		const RxQuery = collection.find();

		return {
			resource: new ObservableResource(RxQuery.$),
			replicationState,
		};
	}, [collection, replicationState]);

	return <GatewaysContext.Provider value={value}>{children}</GatewaysContext.Provider>;
};

export default GatewaysProvider;
