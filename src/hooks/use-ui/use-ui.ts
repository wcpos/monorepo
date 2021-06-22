// import * as React from 'react';
import { tap, filter } from 'rxjs/operators';
import { ObservableResource } from 'observable-hooks';
import useAppState from '../use-app-state';
import initialUI from './ui-initial.json';

interface UiDisplay {
	key: string;
	hide: boolean;
	order: number;
}

interface UiColumn {
	key: string;
	disableSort: boolean;
	order: number;
	width: string;
	hide: boolean;
	hideLabel: boolean;
	display: UiDisplay[];
}

interface UISchema {
	sortBy: string;
	sortDirection: import('@wcpos/common/src/components/table/types').SortDirection;
	width: number;
	columns: UiColumn[];
}

type StoreDatabase = import('@wcpos/common/src/database').StoreDatabase;
export type UIDocument = import('rxdb').RxLocalDocument<UISchema>;
export type UIResource = import('observable-hooks').ObservableResource<UIDocument>;

interface IUIResources {
	posProducts?: UIResource;
	cart?: UIResource;
	products?: UIResource;
	orders?: UIResource;
	customers?: UIResource;
}

const uiResources: IUIResources = {
	posProducts: undefined,
	cart: undefined,
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

	const ui$ = storeDB.getLocal$(`ui_${key}`).pipe(
		filter((uiDoc) => {
			if (!uiDoc && initialUI[key]) {
				storeDB.insertLocal(`ui_${key}`, initialUI[key]);
				return false;
			}
			// add helper function to reset the ui settings
			uiDoc.reset = () => {
				storeDB.upsertLocal(`ui_${key}`, initialUI[key]);
			};
			return uiDoc;
		})
	);

	uiResources[key] = new ObservableResource(ui$);
	return uiResources[key] as UIResource;
};
