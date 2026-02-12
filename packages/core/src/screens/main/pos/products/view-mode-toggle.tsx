import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { IconButton } from '@wcpos/components/icon-button';

import { useUISettings } from '../../contexts/ui-settings';

export function ViewModeToggle() {
	const { uiSettings, patchUI } = useUISettings('pos-products');
	const viewMode = useObservableEagerState(uiSettings.viewMode$);

	const handlePress = React.useCallback(() => {
		patchUI({ viewMode: viewMode === 'table' ? 'grid' : 'table' });
	}, [patchUI, viewMode]);

	return (
		<IconButton
			name={viewMode === 'table' ? 'grid' : 'list'}
			onPress={handlePress}
			testID="view-mode-toggle"
		/>
	);
}
