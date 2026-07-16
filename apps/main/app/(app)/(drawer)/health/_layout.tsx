import * as React from 'react';

import { Slot } from 'expo-router';

import { NavigationAreaLayout } from '@wcpos/core/screens/main/components/navigation-area';

import { useHealthNavigationItems } from '../../../../components/area-navigation/health';
import { useUnreadLogs } from '../../../../components/unread-logs';

export default function HealthLayout() {
	const { count } = useUnreadLogs();
	const items = useHealthNavigationItems(count);

	return (
		<NavigationAreaLayout items={items} testID="health-navigation">
			<Slot />
		</NavigationAreaLayout>
	);
}
