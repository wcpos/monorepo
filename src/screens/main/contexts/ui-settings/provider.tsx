import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import log from '@wcpos/utils/src/logger';

import { hydratedSettings } from './hydrate';
import { useUILabel } from './use-ui-label';
import {
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

interface SuspendedSettingsProps {
	children: React.ReactNode;
	resource: ObservableResource<Record<UISettingID, UISettingState<UISettingID>>>;
}

export interface UISettingsContextValue {
	states: Record<UISettingID, UISettingState<UISettingID>>;
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
const SuspendedSettings = ({ children, resource }: SuspendedSettingsProps) => {
	const { storeDB } = useAppState();
	const { getLabel } = useUILabel();

	// Use useObservableSuspense to get the hydrated states
	const states = useObservableSuspense(resource);

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
			await patchState(state, data);
		},
		[storeDB]
	);

	/**
	 * Context value
	 */
	const value = React.useMemo<UISettingsContextValue>(
		() => ({
			states,
			getLabel,
			reset,
			patch,
		}),
		[states, getLabel, reset, patch]
	);

	return <UISettingsContext.Provider value={value}>{children}</UISettingsContext.Provider>;
};

/**
 *
 */
export const UISettingsProvider = ({ children }: UISettingsProviderProps) => {
	const { storeDB } = useAppState();

	const resource = React.useMemo(() => {
		const settings$ = hydratedSettings(storeDB);
		return new ObservableResource(settings$);
	}, [storeDB]);

	return <SuspendedSettings resource={resource}>{children}</SuspendedSettings>;
};
