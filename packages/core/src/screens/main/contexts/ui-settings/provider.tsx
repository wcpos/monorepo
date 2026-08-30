import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { from } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useUILabel } from './use-ui-label';
import {
	mergeWithInitalValues,
	patchState,
	resetToInitialValues,
	UISettingID,
	UISettingSchema,
	UISettingState,
} from './utils';
import { useStoreSession } from '../../../../contexts/app-state';

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
		coupons: ObservableResource<UISettingState<'coupons'>>;
		customers: ObservableResource<UISettingState<'customers'>>;
		'reports-orders': ObservableResource<UISettingState<'reports-orders'>>;
	};
	getLabel: (id: string, key: string) => string;
	reset: (id: UISettingID) => Promise<void>;
	patch: <T extends UISettingID>(
		id: T,
		data: Partial<UISettingSchema<T>>
	) => Promise<UISettingState<T>>;
}

export const UISettingsContext = React.createContext<UISettingsContextValue | null>(null);

/**
 *
 */
export function UISettingsProvider({ children }: UISettingsProviderProps) {
	const { storeDB } = useStoreSession();
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
	 * Create a reusable function to generate ObservableResource instances.
	 *
	 * These CANNOT loop across a Suspense retry, and need no cache. Every reader is a screen
	 * far below this provider, behind its own boundary — `useUISettings` is only ever called
	 * inside one — so when a reader suspends React unwinds to THAT boundary and commits
	 * everything above it, this provider included, alongside the fallback. The `useMemo` below
	 * therefore survives and the retry reads back the same resource. Only a builder inside the
	 * suspending boundary's own subtree loses its state, which is the Orders blank body (#1707);
	 * `packages/query/tests/suspense-resource.test.tsx` pins both halves of the rule.
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
							code: ERROR_CODES.UNEXPECTED_ERROR,
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
			coupons: createUIResource('coupons'),
			customers: createUIResource('customers'),
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
}
