import * as React from 'react';

import get from 'lodash/get';
import { ObservableResource } from 'observable-hooks';
import { tap, catchError } from 'rxjs/operators';

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
};
export type UIResource = import('observable-hooks').ObservableResource<UIDocument>;

interface UIProviderProps {
	children: React.ReactNode;
}

const resourceIDs = [
	'pos.products',
	'pos.cart',
	'pos.checkout',
	'products',
	'orders',
	'customers',
	'coupons',
] as const;
export type UIResourceID = (typeof resourceIDs)[number];

export const UIContext = React.createContext<{
	uiResources: Record<UIResourceID, UIResource>;
}>(null);

const getLabel = (key: string) => {
	debugger;
	const label = get(initialUI, `${key}.label`);
	if (!label) {
		throw Error(`No label for ${key}`);
	}
	return label;
};

/**
 *
 */
export const UIProvider = ({ children }: UIProviderProps) => {
	const { storeDB } = useStore();
	console.log('render UIProvider');

	/**
	 *
	 */
	const value = React.useMemo(() => {
		/**
		 *
		 */
		function reset(id: UIResourceID) {
			const initial = get(initialUI, id);

			if (!initial) {
				throw Error(`No initial UI for ${id}`);
			}

			storeDB.upsertLocal(id, initial);
		}

		/**
		 *
		 */
		function createUIResource(id: UIResourceID) {
			const resource$ = storeDB.getLocal$(id).pipe(
				tap((localDoc) => {
					if (!localDoc) {
						reset(id);
					}

					// add helper functions
					Object.assign(localDoc, reset, getLabel);
				}),
				catchError(() => {
					throw new Error('Error finding global user');
				})
			);

			return new ObservableResource(resource$, (val) => !!val);
		}

		/**
		 *
		 */
		return {
			uiResources: {
				'pos.products': createUIResource('pos.products'),
				'pos.cart': createUIResource('pos.cart'),
				// 'pos.checkout': createUIResource('pos.checkout'),
				products: createUIResource('products'),
				orders: createUIResource('orders'),
				customers: createUIResource('customers'),
				// coupons: getResource('pos.products'),
			},
		};
	}, [storeDB]);

	/**
	 *
	 */
	return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
};
