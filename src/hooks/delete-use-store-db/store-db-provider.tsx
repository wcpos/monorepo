import * as React from 'react';
import { useObservableSuspense, ObservableResource } from 'observable-hooks';
import { from, of } from 'rxjs';
import { map, switchMap, filter, tap } from 'rxjs/operators';
import { getStoreDB$ } from '@wcpos/common/src/database/stores-db';
import useUser from '../use-user';

type StoreDatabase = import('@wcpos/common/src/database').StoreDatabase;
type StoreDocument = import('@wcpos/common/src/database').StoreDocument;

interface IStoreDBContextProps {
	storeResource: ObservableResource<StoreDocument>;
	storeDBResource: ObservableResource<StoreDatabase>;
	// storeDB?: StoreDatabase;
	// setStoreDB: React.Dispatch<React.SetStateAction<StoreDatabase | undefined>>;
}

// @ts-ignore
export const StoreDBContext = React.createContext<IStoreDBContextProps>();

interface IStoreDBProviderProps {
	children: React.ReactNode;
	stores?: import('../../types').InitialStoresProps;
}

const StoreDBProvider = ({ children, stores: initStores }: IStoreDBProviderProps) => {
	const { userDB } = useUser();
	let store$;

	if (initStores) {
		// find existing record by id
		// note: this needs to be improved, could be many records with same id
		const query = userDB.stores.findOne({ selector: { id: initStores.id } });
		store$ = query.$.pipe(
			// @ts-ignore
			tap((result) => {
				if (!result) {
					// @ts-ignore
					userDB.stores.insert(initStores);
					// } else {
					// 	result.atomicPatch(initWpCredentials);
				}
			})
		);
	} else {
		store$ = userDB.stores.getLocal$('current').pipe(
			switchMap((current) => {
				const localID = current?.get('id');
				const query = userDB.stores.findOne(localID);
				return query.$;
			})
		);
	}

	const storeDB$ = store$.pipe(
		// @ts-ignore
		switchMap((store) => {
			if (store) {
				return getStoreDB$(store.localID);
			}
			return of(null);
		})
	);

	const storeResource = new ObservableResource(store$);
	const storeDBResource = new ObservableResource(storeDB$);

	return (
		// @ts-ignore
		<StoreDBContext.Provider value={{ storeResource, storeDBResource }}>
			{children}
		</StoreDBContext.Provider>
	);
};

export default StoreDBProvider;
