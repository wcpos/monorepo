import * as React from 'react';

import type { StoreCollections, StoreDatabase } from '@wcpos/database';

import { useAppState } from '../../contexts/app-state';

function useSessionCollection<K extends 'register_sessions' | 'cash_movements'>(
	name: K
): StoreCollections[K] | undefined {
	const { storeDB } = useAppState();
	const [swap, setSwap] = React.useState<{
		database: StoreDatabase;
		collection: StoreCollections[K];
	} | null>(null);
	// RxDB reset replaces a collection; only accept events from the currently mounted store.
	React.useEffect(() => {
		const database = storeDB;
		const subscription = database?.reset$?.subscribe((collection) => {
			if (
				collection.name === name &&
				(!collection.database || (collection.database as unknown) === database)
			) {
				setSwap({ database, collection: collection as StoreCollections[K] });
			}
		});
		return () => subscription?.unsubscribe();
	}, [storeDB, name]);
	return swap?.database === storeDB ? swap?.collection : storeDB?.collections[name];
}
export const useRegisterSessionCollection = () => useSessionCollection('register_sessions');
export const useCashMovementCollection = () => useSessionCollection('cash_movements');
