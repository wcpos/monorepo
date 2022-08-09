import * as React from 'react';
import { useObservableSuspense, ObservableResource } from 'observable-hooks';
import { filter } from 'rxjs/operators';
import get from 'lodash/get';
import initialUI from './ui-initial.json';

type StoreDatabase = import('@wcpos/database').StoreDatabase;
type StoreDocument = import('@wcpos/database').StoreDocument;

export interface UIDisplay {
	key: string;
	hide: boolean;
	order: number;
}

export interface UIColumn {
	key: string;
	disableSort: boolean;
	order: number;
	width: string;
	show: boolean;
	hideLabel: boolean;
	display: UIDisplay[];
}

export interface UISchema {
	sortBy: string;
	sortDirection: import('@wcpos/components/src/table').SortDirection;
	width: number;
	columns: UIColumn[];
}

export type UIDocument = import('rxdb').RxLocalDocument<StoreDatabase, UISchema> & {
	reset: () => void;
	getID: () => string;
};
export type UIResource = import('observable-hooks').ObservableResource<UIDocument>;

interface StoreProviderProps {
	children: React.ReactNode;
	store: import('@wcpos/database/src/index').StoreDocument;
	storeDB: StoreDatabase;
}

export type UIResourceID =
	| 'pos.products'
	| 'pos.cart'
	| 'pos.checkout'
	| 'products'
	| 'orders'
	| 'customers'
	| 'coupons';

export const StoreContext = React.createContext<{
	store: StoreDocument;
	storeDB: StoreDatabase;
	uiResources: Record<UIResourceID, UIResource>;
}>(null);

/**
 * Note: store is provided by the AuthProvider and then passed through StoreProvider
 * - store is the store document from the user database
 * - storeDB is the store database
 */
export const StoreProvider = ({ store, storeDB, children }: StoreProviderProps) => {
	/**
	 *
	 */
	const getUIResource = React.useCallback(
		(id: UIResourceID) => {
			const resource = storeDB.getLocal$(id).pipe(
				filter((localDoc) => {
					const initial = get(initialUI, id);

					if (!initial) {
						throw Error(`No initial UI for ${id}`);
					}

					if (!localDoc) {
						storeDB.insertLocal(id, initial);
						return false;
					}

					// add helper functions
					Object.assign(localDoc, {
						// reset the ui settings
						reset: () => {
							storeDB.upsertLocal(id, initial);
						},
					});

					return localDoc;
				})
			);

			return new ObservableResource(resource);
		},
		[storeDB]
	);

	/**
	 *
	 */
	const value = React.useMemo(
		() => ({
			store,
			storeDB,
			uiResources: {
				'pos.products': getUIResource('pos.products'),
				'pos.cart': getUIResource('pos.cart'),
				// 'pos.checkout': getUIResource('pos.checkout'),
				products: getUIResource('products'),
				orders: getUIResource('orders'),
				customers: getUIResource('customers'),
				// coupons: getResource('pos.products'),
			},
		}),
		[getUIResource, store, storeDB]
	);

	/**
	 *
	 */
	return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
};
