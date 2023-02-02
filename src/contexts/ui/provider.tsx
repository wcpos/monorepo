import * as React from 'react';

import get from 'lodash/get';
import { ObservableResource } from 'observable-hooks';
import { filter } from 'rxjs/operators';

import initialUI from './ui-initial.json';
import useStore from '../../contexts/store';

type StoreDatabase = import('@wcpos/database').StoreDatabase;

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

interface UIProviderProps {
	children: React.ReactNode;
}

export type UIResourceID =
	| 'pos.products'
	| 'pos.cart'
	| 'pos.checkout'
	| 'products'
	| 'orders'
	| 'customers'
	| 'coupons';

export const UIContext = React.createContext<{
	uiResources: Record<UIResourceID, UIResource>;
}>(null);

/**
 *
 */
export const UIProvider = ({ children }: UIProviderProps) => {
	const { storeDB } = useStore();
	console.log('render UIProvider');

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

					return !!localDoc;
				})
			);

			return new ObservableResource(resource);
		},
		[storeDB]
	);

	/**
	 *
	 */
	const value = React.useMemo(() => {
		return {
			uiResources: {
				'pos.products': getUIResource('pos.products'),
				'pos.cart': getUIResource('pos.cart'),
				// 'pos.checkout': getUIResource('pos.checkout'),
				products: getUIResource('products'),
				orders: getUIResource('orders'),
				customers: getUIResource('customers'),
				// coupons: getResource('pos.products'),
			},
		};
	}, [getUIResource]);

	/**
	 *
	 */
	return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
};
