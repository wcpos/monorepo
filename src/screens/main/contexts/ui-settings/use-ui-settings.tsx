import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import { UISettingsContext, UISettingsResourceID } from './provider';
import { t } from '../../../../lib/translations';

export const useUISettings = (id: UISettingsResourceID) => {
	const context = React.useContext(UISettingsContext);
	if (!context) {
		throw new Error(`useUISettings must be called within UISettingsProvider`);
	}

	const resource = context.uiResources[id];
	const uiSettings = useObservableSuspense(resource);
	return { uiSettings };
};
