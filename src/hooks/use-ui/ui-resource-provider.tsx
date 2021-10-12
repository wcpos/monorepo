import * as React from 'react'
import { tap, filter } from 'rxjs/operators';
import { ObservableResource } from 'observable-hooks';
import get from 'lodash/get'
import useStoreDB from '../use-store-db';
import initialUI from './ui-initial.json';

interface UIDisplay {
	key: string;
	hide: boolean;
	order: number;
}

interface UIColumn {
	key: string;
	disableSort: boolean;
	order: number;
	width: string;
	hide: boolean;
	hideLabel: boolean;
	display: UIDisplay[];
}

interface UISchema {
	sortBy: string;
	sortDirection: import('@wcpos/common/src/components/table/types').SortDirection;
	width: number;
	columns: UIColumn[];
}

type StoreDatabase = import('@wcpos/common/src/database').StoreDatabase;
export type UIDocument = import('rxdb').RxLocalDocument<UISchema>;
export type UIResource = import('observable-hooks').ObservableResource<UIDocument>;

interface UIResources {
	posProducts: UIResource;
	cart: UIResource;
	products: UIResource;
	orders: UIResource;
	customers: UIResource;
}

// const uiResources: IUIResources = {
// 	posProducts: undefined,
// 	cart: undefined,
// 	products: undefined,
// 	orders: undefined,
// 	customers: undefined,
// };

// @ts-ignore
export const UIResourceContext = React.createContext<UIResources>();

interface UIResourceProviderProps {
	children: React.ReactNode;
}

const UIResourceProvider = ({ children }: UIResourceProviderProps) => {
	const { storeDB } = useStoreDB();

	const getResource = (key: string) => {
		const resource$ = storeDB.getLocal$(`ui_${key}`).pipe(
			filter((uiDoc) => {
				const initial = get(initialUI, key);
				if (!uiDoc && initial) {
					storeDB.insertLocal(`ui_${key}`, initial);
					return false;
				}
				// add helper function to reset the ui settings
				uiDoc.reset = () => {
					storeDB.upsertLocal(`ui_${key}`, initial);
				};
				return uiDoc;
			})
		);

		return new ObservableResource(resource$, val => !!val);
	}

	const uiResources = {
		posProducts: getResource('posProducts'),
		cart: getResource('cart'),
		products: getResource('products'),
		orders: getResource('orders'),
		customers: getResource('customers')
	}

	return <UIResourceContext.Provider value={uiResources}>{children}</UIResourceContext.Provider>
}

export default UIResourceProvider;