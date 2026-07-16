import * as React from 'react';

import { NavigationAreaIndex } from '@wcpos/core/screens/main/components/navigation-area';

import { useSettingsNavigationItems } from '../../../../components/area-navigation/settings';

export default function SettingsIndex() {
	const items = useSettingsNavigationItems();

	return (
		<NavigationAreaIndex items={items} defaultHref="/settings/general" testID="screen-settings" />
	);
}
