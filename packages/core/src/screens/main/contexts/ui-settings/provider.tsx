import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { from } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { getLogger } from '@wcpos/utils/logger';

import { useUILabel } from './use-ui-label';
import {
	mergeWithInitalValues,
	patchState,
	resetToInitialValues,
	UISettingID,
	UISettingSchema,
	UISettingState,
} from './utils';
import { useAppState } from '../../../../contexts/app-state';

const uiLogger = getLogger(['wcpos', 'ui', 'settings']);

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
		'reports-orders': ObservableResource<UISettingState<'reports-orders'>>;
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
 *
 */
export const UISettingsProvider = ({ children }: UISettingsProviderProps) => {
	const { storeDB } = useAppState();
	const { getLabel } = useUILabel();

	/**
	 * Reset UI Settings
	 */
	const reset = React.useCallback(
		async (id: UISettingID) => {
			const state = await storeDB.addState(`${id}_v2`);
			await resetToInitialValues(id, state);
		},
		[storeDB]
	);

	/**
	 * Patch UI Settings
	 */
	const patch = React.useCallback(
		async <T extends UISettingID>(id: T, data: Partial<UISettingSchema<T>>) => {
			const state = await storeDB.addState(`${id}_v2`);
			return patchState(state, data) as Promise<UISettingState<T>>;
		},
		[storeDB]
	);

	/**
	 * Create a reusable function to generate ObservableResource instances
	 */
	const createUIResource = React.useCallback(
		<T extends UISettingID>(id: T) => {
			// Add timeout detection for potential hangs
			const addStatePromise = storeDB.addState(`${id}_v2`);
			const timeoutId = setTimeout(() => {
				uiLogger.warn(
					`storeDB.addState('${id}_v2') is taking longer than 5 seconds - possible hang`
				);
			}, 5000);

			const observable$ = from(addStatePromise).pipe(
				switchMap(async (state) => {
					clearTimeout(timeoutId);
					try {
						await mergeWithInitalValues(id, state as UISettingState<UISettingID>);
						return state as UISettingState<T>;
					} catch (error) {
						uiLogger.error(`Failed to merge initial values for ${id}`, {
							context: { error: String(error) },
						});
						throw error;
					}
				})
			);

			return new ObservableResource(observable$);
		},
		[storeDB]
	);

	/**
	 * Create UI Resources
	 */
	const resources = React.useMemo(
		() => ({
			'pos-products': createUIResource('pos-products'),
			'pos-cart': createUIResource('pos-cart'),
			products: createUIResource('products'),
			orders: createUIResource('orders'),
			customers: createUIResource('customers'),
			logs: createUIResource('logs'),
			'reports-orders': createUIResource('reports-orders'),
		}),
		[createUIResource]
	);

	/**
	 * Provide the context value
	 */
	const value = React.useMemo(
		() => ({
			resources,
			getLabel,
			reset,
			patch,
		}),
		[resources, getLabel, reset, patch]
	);

	return <UISettingsContext.Provider value={value}>{children}</UISettingsContext.Provider>;
};
