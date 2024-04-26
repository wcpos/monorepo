import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import { UISettingsContext } from './provider';
import { UISettingState, UISettingID, UISettingSchema } from './utils';

/**
 *
 */
export const useUISettings = <T extends UISettingID>(id: T) => {
	const context = React.useContext(UISettingsContext);
	if (!context) {
		throw new Error(`useUISettings must be called within UISettingsProvider`);
	}

	/**
	 *
	 */
	const getUILabel = React.useCallback(
		(key: string) => {
			return context.getLabel(id, key);
		},
		[context, id]
	);

	/**
	 *
	 */
	const resource = context.resources[id];
	const uiSettings = useObservableSuspense(resource) as UISettingState<T>;

	return {
		uiSettings,
		getUILabel,
		resetUI: () => context.reset(id),
		patchUI: (data: Partial<UISettingSchema<T>>) => context.patch(id, data),
	};
};
