import * as React from 'react';

import { ObservableResource, useObservable } from 'observable-hooks';
import { switchMap, distinctUntilChanged, tap } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import { useUILabel } from './use-ui-label';
import {
	mergeWithInitalValues,
	UISettingSchema,
	UISettingState,
	resetToInitialValues,
	UISettingID,
	patchState,
} from './utils';
import { useAppState } from '../../../../contexts/app-state';

interface UISettingsProviderProps {
	children: React.ReactNode;
}

export interface UISettingsContextValue {
	resources: {
		'pos-products': ObservableResource<UISettingState<'pos-products'>>;
		'pos-cart': ObservableResource<UISettingState<'pos-cart'>>;
		products: ObservableResource<UISettingState<'products'>>;
		orders: ObservableResource<UISettingState<'orders'>>;
		customers: ObservableResource<UISettingState<'customers'>>;
		logs: ObservableResource<UISettingState<'logs'>>;
	};
	getLabel: (id: string, key: string) => string;
	reset: (id: UISettingID) => Promise<void>;
	patch: <T extends UISettingID>(
		id: T,
		data: Partial<UISettingSchema<T>>
	) => Promise<UISettingState<T>>;
}

export const UISettingsContext = React.createContext<UISettingsContextValue>(null);

/**
 * @TODO - this is messy, needs to be refactored, perhaps register uiSettings as part of
 * Store State Manager, and then use that to create the uiResources
 */
export const UISettingsProvider = ({ children }: UISettingsProviderProps) => {
	const { storeDB } = useAppState();
	const { getLabel } = useUILabel();

	/**
	 * Create UI Observables
	 */
	const posProducts$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap(async ([db]) => {
					const state = await db.addState<UISettingSchema<'pos-products'>>('pos-products');
					await mergeWithInitalValues('pos-products', state);
					return state;
				})
			),
		[storeDB]
	);

	const posCart$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap(async ([db]) => {
					const state = await db.addState<UISettingSchema<'pos-cart'>>('pos-cart');
					await mergeWithInitalValues('pos-cart', state);
					return state;
				})
			),
		[storeDB]
	);

	const products$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap(async ([db]) => {
					const state = await db.addState<UISettingSchema<'products'>>('products');
					await mergeWithInitalValues('products', state);
					return state;
				})
			),
		[storeDB]
	);

	const orders$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap(async ([db]) => {
					const state = await db.addState<UISettingSchema<'orders'>>('orders');
					await mergeWithInitalValues('orders', state);
					return state;
				})
			),
		[storeDB]
	);

	const customers$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap(async ([db]) => {
					const state = await db.addState<UISettingSchema<'customers'>>('customers');
					await mergeWithInitalValues('customers', state);
					return state;
				})
			),
		[storeDB]
	);

	const logs$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap(async ([db]) => {
					const state = await db.addState<UISettingSchema<'logs'>>('logs');
					await mergeWithInitalValues('logs', state);
					return state;
				})
			),
		[storeDB]
	);

	/**
	 * Reset UI Settings
	 */
	const reset = React.useCallback(
		async (id: UISettingID) => {
			const state = await storeDB.addState(id);
			await resetToInitialValues(id, state);
		},
		[storeDB]
	);

	/**
	 * Patch UI Settings
	 */
	const patch = React.useCallback(
		async (id: UISettingID, data: Partial<UISettingSchema<UISettingID>>) => {
			const state = await storeDB.addState(id);
			await patchState(state, data);
		},
		[storeDB]
	);

	/**
	 * Create UI Resources
	 */
	const value = React.useMemo(
		() => ({
			resources: {
				'pos-products': new ObservableResource(posProducts$),
				'pos-cart': new ObservableResource(posCart$),
				products: new ObservableResource(products$),
				orders: new ObservableResource(orders$),
				customers: new ObservableResource(customers$),
				logs: new ObservableResource(logs$),
			},
			getLabel,
			reset,
			patch,
		}),
		[customers$, getLabel, logs$, orders$, patch, posCart$, posProducts$, products$, reset]
	);

	/**
	 *
	 */
	return <UISettingsContext.Provider value={value}>{children}</UISettingsContext.Provider>;
};
