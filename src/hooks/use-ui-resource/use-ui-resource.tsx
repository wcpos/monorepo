import * as React from 'react';
import { ObservableResource } from 'observable-hooks';
import { filter } from 'rxjs/operators';
import get from 'lodash/get';
import useAppState from '../use-app-state';
import initialUI from './ui-initial.json';

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
	sortDirection: import('@wcpos/common/src/components/table/types').SortDirection;
	width: number;
	columns: UIColumn[];
}

type StoreDatabase = import('@wcpos/common/src/database').StoreDatabase;
export type UIDocument = import('rxdb').RxLocalDocument<StoreDatabase, UISchema> & {
	reset: () => void;
	getID: () => string;
};
export type UIResource = import('observable-hooks').ObservableResource<UIDocument>;

export type UIResourceID =
	| 'pos.products'
	| 'pos.cart'
	| 'pos.checkout'
	| 'products'
	| 'orders'
	| 'customers'
	| 'coupons';

const resourceRegistry = new Map();

export const useUIResource = (id: UIResourceID) => {
	const { storeDB } = useAppState();
	const databaseKey = `ui_${id}`;
	const registryKey = `${storeDB.name}_${databaseKey}`;

	// check registry first to avoid creating a new resource on every render
	if (resourceRegistry.has(registryKey)) {
		return resourceRegistry.get(registryKey);
	}

	/**
	 *
	 */
	const resource$ = storeDB.getLocal$(databaseKey).pipe(
		filter((localDoc) => {
			const initial = get(initialUI, id);

			if (!initial) {
				throw Error(`No initial UI for ${id}`);
			}

			if (!localDoc) {
				storeDB.insertLocal(databaseKey, initial);
				return false;
			}

			// add helper functions
			Object.assign(localDoc, {
				// reset the ui settings
				reset: () => {
					storeDB.upsertLocal(databaseKey, initial);
				},
				// get the ui id
				getID: () => localDoc.id.split('_')[1],
			});

			return localDoc;
		})
	);

	const resource = new ObservableResource<UIDocument>(resource$, (val) => !!val);
	resourceRegistry.set(registryKey, resource);
	return resource;
};
