// import * as React from 'react';
import { tap, filter } from 'rxjs/operators';
import { ObservableResource } from 'observable-hooks';
import useAppState from '../use-app-state';
import initialUI from './ui-initial.json';

interface UISchema {
	sortBy: string;
	sortDirection: import('@wcpos/common/src/components/table/types').SortDirection;
	width: string;
	columns: [{ key: string; disableSort: boolean; order: number }];
	display: [{ key: string; hide: boolean; order: number }];
}

type StoreDatabase = import('@wcpos/common/src/database').StoreDatabase;
type UIDocument = import('rxdb').RxDocument<UISchema>;
type UIResource = import('observable-hooks').ObservableResource<UIDocument>;

interface IUIResources {
	posProducts?: UIResource;
	posCart?: UIResource;
	products?: UIResource;
	orders?: UIResource;
	customers?: UIResource;
}

const uiResources: IUIResources = {
	posProducts: undefined,
	posCart: undefined,
	products: undefined,
	orders: undefined,
	customers: undefined,
};

/**
 *
 * @param key
 */
export const useUI = (key: Extract<keyof IUIResources, string>) => {
	const { storeDB } = useAppState() as { storeDB: StoreDatabase };

	if (uiResources[key]) {
		return uiResources[key] as UIResource;
	}

	const ui$ = storeDB.getLocal$(`ui${key}`).pipe(
		filter((uiDoc) => {
			if (!uiDoc && initialUI[key]) {
				storeDB.insertLocal(`ui${key}`, initialUI[key]);
				return false;
			}
			return uiDoc;
		})
	);

	uiResources[key] = new ObservableResource(ui$);
	return uiResources[key] as UIResource;
};
