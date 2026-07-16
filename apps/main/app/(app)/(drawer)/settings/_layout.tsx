import * as React from 'react';

import { Slot } from 'expo-router';

import { NavigationAreaLayout } from '@wcpos/core/screens/main/components/navigation-area';

import { useSettingsNavigationItems } from '../../../../components/area-navigation/settings';

export default function SettingsLayout() {
	const items = useSettingsNavigationItems();

	return (
		<NavigationAreaLayout items={items} testID="settings-navigation">
			<Slot />
		</NavigationAreaLayout>
	);
}
