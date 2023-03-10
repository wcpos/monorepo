import * as React from 'react';

import get from 'lodash/get';
import { ObservableResource } from 'observable-hooks';
import { tap, catchError } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import initialSettings from './initial-settings.json';
import { getTranslatedLabels } from './labels';
import useLocalData from '../../../../contexts/local-data';
import { t } from '../../../../lib/translations';

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
 *
 */
export const UISettingsProvider = ({ children }: UISettingsProviderProps) => {
	const { storeDB, locale } = useLocalData();

	/**
	 *
	 */
	const getLabel = React.useCallback(
		(id: string, key: string) => {
			const labels = getTranslatedLabels();
			return get(labels, [id, key], t('{item} label not found', { _tags: 'core', item: key }));
		},
		[locale]
	);

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
		 *
		 */
		function createUIResource(id: UISettingsResourceID) {
			const resource$ = storeDB.getLocal$(id).pipe(
				tap((localDoc) => {
					if (!localDoc) {
						reset(id);
					} else {
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
