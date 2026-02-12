import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';

import { useT } from '../../../../contexts/translations';
import { useUISettings } from '../../contexts/ui-settings';

export function ViewModeToggle() {
	const { uiSettings, patchUI } = useUISettings('pos-products');
	const viewMode = useObservableEagerState(uiSettings.viewMode$);
	const t = useT();

	const handlePress = React.useCallback(() => {
		patchUI({ viewMode: viewMode === 'table' ? 'grid' : 'table' });
	}, [patchUI, viewMode]);

	const tooltipText =
		viewMode === 'table'
			? t('pos_products.switch_to_grid_view')
			: t('pos_products.switch_to_table_view');

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<IconButton
					name={viewMode === 'table' ? 'grid' : 'list'}
					onPress={handlePress}
					testID="view-mode-toggle"
				/>
			</TooltipTrigger>
			<TooltipContent>
				<Text>{tooltipText}</Text>
			</TooltipContent>
		</Tooltip>
	);
}
