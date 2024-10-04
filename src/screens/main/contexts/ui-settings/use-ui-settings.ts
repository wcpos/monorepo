import * as React from 'react';

import { UISettingsContext } from './provider';
import { UISettingID, UISettingState, UISettingSchema } from './utils';

export const useUISettings = <T extends UISettingID>(id: T) => {
	const context = React.useContext(UISettingsContext);
	if (!context) {
		throw new Error(`useUISettings must be called within UISettingsProvider`);
	}

	const { states, getLabel, reset, patch } = context;

	/**
	 * Get UI Label
	 */
	const getUILabel = React.useCallback((key: string) => getLabel(id, key), [getLabel, id]);

	/**
	 * Get UI Settings for the specified ID
	 */
	const uiSettings = states[id] as UISettingState<T>;

	return {
		uiSettings,
		getUILabel,
		resetUI: () => reset(id),
		patchUI: (data: Partial<UISettingSchema<T>>) => patch(id, data),
	};
};
