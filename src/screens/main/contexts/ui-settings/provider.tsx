import * as React from 'react';

import get from 'lodash/get';
import { ObservableResource, useObservableState } from 'observable-hooks';
import { tap, catchError } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import initialSettings from './initial-settings.json';
import { useUILabel } from './use-ui-label';
import { useAppState } from '../../../../contexts/app-state';

type StoreDatabase = import('@wcpos/database').StoreDatabase;

export interface UISettingsDisplay {
	key: string;
	hide: boolean;
	order: number;
}

export interface UISettingsColumn {
	key: string;
	disableSort: boolean;
	order: number;
	width: string;
	show: boolean;
	hideLabel: boolean;
	display: UISettingsDisplay[];
}

export interface UISettingsSchema {
	sortBy: string;
	sortDirection: import('@wcpos/components/src/table').SortDirection;
	width: number;
	columns: UISettingsColumn[];
}

export type UISettingsDocument = import('rxdb').RxLocalDocument<StoreDatabase, UISettingsSchema> & {
	reset: () => void;
	getLabel: (key: string) => string;
};
export type UISettingsResource = import('observable-hooks').ObservableResource<UISettingsDocument>;

interface UISettingsProviderProps {
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
export type UISettingsResourceID = (typeof resourceIDs)[number];

export const UISettingsContext = React.createContext<{
	uiResources: Record<UISettingsResourceID, UISettingsResource>;
}>(null);

/**
 * @TODO - this is messy, needs to be refactored, perhaps register uiSettings as part of
 * Store State Manager, and then use that to create the uiResources
 */
export const UISettingsProvider = ({ children }: UISettingsProviderProps) => {
	const { storeDB } = useAppState();
	const { getLabel } = useUILabel();

	/**
	 *
	 */
	const value = React.useMemo(() => {
		/**
		 *
		 */
		function reset(id: UISettingsResourceID) {
			const initial = get(initialSettings, id);
			storeDB.upsertLocal(id, initial);
		}

		/**
		 * @TODO - I need to have a process to migrate to new settings schema
		 */
		function createUIResource(id: UISettingsResourceID) {
			const resource$ = storeDB.getLocal$(id).pipe(
				tap((localDoc) => {
					const initial = get(initialSettings, id);
					if (!localDoc) {
						storeDB.insertLocal(id, initial);
					} else {
						// hack for cart discounts
						if (id === 'pos.cart') {
							const quickDiscounts = localDoc.get('quickDiscounts');
							if (!quickDiscounts) {
								localDoc.incrementalPatch({ quickDiscounts: initial.quickDiscounts || [] });
							}
						}
						// add helper functions
						Object.assign(localDoc, {
							reset,
							getLabel: (key) => getLabel(localDoc.id, key),
						});
					}
				}),
				catchError((err) => {
					log.error(err);
					throw new Error('Error loading UI resources');
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
	}, [storeDB, getLabel]);

	/**
	 *
	 */
	return <UISettingsContext.Provider value={value}>{children}</UISettingsContext.Provider>;
};
