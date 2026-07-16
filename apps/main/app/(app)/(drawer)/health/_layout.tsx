import * as React from 'react';

import { Slot } from 'expo-router';

import { useT } from '@wcpos/core/contexts/translations';
import { NavigationAreaLayout } from '@wcpos/core/screens/main/components/navigation-area';

import { useHealthNavigationItems } from '../../../../components/area-navigation/health';
import { useUnreadLogs } from '../../../../components/unread-logs';

export default function HealthLayout() {
	const { count } = useUnreadLogs();
	const items = useHealthNavigationItems(count);

	const t = useT();

	return (
		<NavigationAreaLayout
			items={items}
			indexHref="/health"
			areaLabel={t('common.store_health', 'Store health')}
			testID="health-navigation"
		>
			<Slot />
		</NavigationAreaLayout>
	);
}
