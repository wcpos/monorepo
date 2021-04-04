// import * as React from 'react';
import { tap, filter } from 'rxjs/operators';
import { ObservableResource } from 'observable-hooks';
import useAppState from '../use-app-state';
import initialUI from './ui-initial.json';

type UIKeys = 'posProducts' | 'posCart';
type StoreDatabase = import('@wcpos/common/src/database').StoreDatabase;
type UIDocument = Record<string, unknown>;
type UIResource = import('observable-hooks').ObservableResource<UIDocument>;

interface IUIResources {
	posProducts?: UIResource;
	posCart?: UIResource;
}

const uiResources: IUIResources = {
	posProducts: undefined,
	posCart: undefined,
};

/**
 *
 * @param key
 */
export const useUI = (key: UIKeys): UIResource => {
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
