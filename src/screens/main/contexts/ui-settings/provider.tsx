import * as React from 'react';

import get from 'lodash/get';
import { ObservableResource, useObservableState } from 'observable-hooks';
import { tap, catchError } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import initialSettings from './initial-settings.json';
import { getTranslatedLabels } from './labels';
import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';

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
	const t = useT();

	/**
	 *
	 */
	const getLabel = React.useCallback(
		(id: string, key: string) => {
			const labels = {
				'pos.products': {
					showOutOfStock: t('Show out-of-stock products', { _tags: 'core' }),
					image: t('Image', { _tags: 'core' }),
					name: t('Product', { _tags: 'core' }),
					stock_quantity: t('Stock', { _tags: 'core' }),
					sku: t('SKU', { _tags: 'core' }),
					barcode: t('Barcode', { _tags: 'core' }),
					categories: t('Categories', { _tags: 'core' }),
					tags: t('Tags', { _tags: 'core' }),
					type: t('Type', { _tags: 'core' }),
					regular_price: t('Regular price', { _tags: 'core' }),
					on_sale: t('On sale', { _tags: 'core' }),
					price: t('Price', { _tags: 'core' }),
					tax: t('Tax', { _tags: 'core' }),
					actions: t('Actions', { _tags: 'core' }),
					attributes: t('Attributes', { _tags: 'core' }),
				},
				'pos.cart': {
					quickDiscounts: t('Quick Discounts', { _tags: 'core' }),
					quantity: t('Qty', { _tags: 'core', _context: 'Short for quantity' }),
					split: t('Split', { _tags: 'core', _context: 'Split quantity' }),
					name: t('Name', { _tags: 'core' }),
					sku: t('SKU', { _tags: 'core' }),
					price: t('Price', { _tags: 'core' }),
					total: t('Total', { _tags: 'core' }),
					subtotal: t('Subtotal', { _tags: 'core' }),
					tax: t('Tax', { _tags: 'core' }),
					actions: t('Actions', { _tags: 'core' }),
				},
				products: {
					image: t('Image', { _tags: 'core' }),
					id: t('ID', { _tags: 'core' }),
					name: t('Product', { _tags: 'core' }),
					stock_quantity: t('Stock', { _tags: 'core' }),
					stock_status: t('Stock Status', { _tags: 'core' }),
					sku: t('SKU', { _tags: 'core' }),
					barcode: t('Barcode', { _tags: 'core' }),
					categories: t('Categories', { _tags: 'core' }),
					tags: t('Tags', { _tags: 'core' }),
					type: t('Type', { _tags: 'core' }),
					price: t('Price', { _tags: 'core' }),
					regular_price: t('Regular price', { _tags: 'core' }),
					sale_price: t('Sale price', { _tags: 'core' }),
					tax: t('Tax', { _tags: 'core' }),
					date_created: t('Date created', { _tags: 'core' }),
					date_modified: t('Date modified', { _tags: 'core' }),
					actions: t('Actions', { _tags: 'core' }),
					attributes: t('Attributes', { _tags: 'core' }),
				},
				orders: {
					status: t('Status', { _tags: 'core' }),
					number: t('Order Number', { _tags: 'core' }),
					customer_id: t('Customer', { _tags: 'core' }),
					billing: t('Billing Address', { _tags: 'core' }),
					shipping: t('Shipping Address', { _tags: 'core' }),
					products: t('Products', { _tags: 'core' }),
					customer_note: t('Customer Note', { _tags: 'core' }),
					date_created: t('Date created', { _tags: 'core' }),
					date_modified: t('Date modified', { _tags: 'core' }),
					date_completed: t('Date completed', { _tags: 'core' }),
					payment_method: t('Payment Method', { _tags: 'core' }),
					total: t('Total', { _tags: 'core' }),
					actions: t('Actions', { _tags: 'core' }),
				},
				customers: {
					avatar_url: t('Image', { _tags: 'core' }),
					id: t('ID', { _tags: 'core' }),
					first_name: t('First Name', { _tags: 'core' }),
					last_name: t('Last Name', { _tags: 'core' }),
					email: t('Email', { _tags: 'core' }),
					billing: t('Billing Address', { _tags: 'core' }),
					shipping: t('Shipping Address', { _tags: 'core' }),
					role: t('Role', { _tags: 'core' }),
					username: t('Username', { _tags: 'core' }),
					date_created: t('Date created', { _tags: 'core' }),
					actions: t('Actions', { _tags: 'core' }),
				},
			};

			return get(labels, [id, key], t('{item} label not found', { _tags: 'core', item: key }));
		},
		[t]
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
