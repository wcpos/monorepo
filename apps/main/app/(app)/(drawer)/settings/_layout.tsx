import * as React from 'react';

import { Slot } from 'expo-router';

import { useT } from '@wcpos/core/contexts/translations';
import { NavigationAreaLayout } from '@wcpos/core/screens/main/components/navigation-area';

import { useSettingsNavigationItems } from '../../../../components/area-navigation/settings';

export default function SettingsLayout() {
	const items = useSettingsNavigationItems();
	const t = useT();

	return (
		<NavigationAreaLayout
			items={items}
			indexHref="/settings"
			areaLabel={t('common.settings')}
			testID="settings-navigation"
			screenTestID="settings-screen"
		>
			<Slot />
		</NavigationAreaLayout>
	);
}
